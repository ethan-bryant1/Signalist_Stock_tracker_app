// The Portfolio page's backtest and portfolio statistics: deterministic, no server or browser APIs, unit tested in
// tests/backtest.test.ts with hand-checked numbers.
//
// Method (also shown on the page, see ASSUMPTIONS):
//   - Prices are Alpaca daily bars adjusted for splits and dividends (lib/daily-bars.ts), so returns include
//     reinvested dividends. Days are the sessions every holding and the benchmark have a bar for.
//   - No look-ahead: every decision uses closes up to the previous session and trades at the next session's open.
//     The first purchase is at the first day's open. Scheduled rebalances trade at the open of the first session of
//     the new month, quarter or year.
//   - Costs: `costBps` of every dollar bought or sold (commission plus slippage), taken from the portfolio.
//   - Cash earns nothing. Fractional shares are allowed.
//   - Trend filter: a holding is held only while its close is above its N-day simple moving average at the previous
//     close; otherwise its weight sits in cash. Until N closes exist, it sits in cash.
//   - Simple returns (v1 − v0) / v0. Annualized figures use 252 sessions a year for volatility and calendar time
//     for growth; they're left out for periods under a year. Sharpe uses a 0% risk-free rate.

import { addDays, isTradingDay, nextTradingDay } from "@/lib/market-calendar";

export type PriceSeries = { days: readonly string[]; open: readonly number[]; close: readonly number[] };

export type Holding = { symbol: string; weight: number };
export type Rebalance = "none" | "monthly" | "quarterly" | "yearly";
export type Strategy = { kind: "hold" } | { kind: "trend"; window: number };

export type BacktestInput = {
    series: Readonly<Record<string, PriceSeries>>;
    holdings: readonly Holding[];
    benchmark: string;
    // Inclusive session days ("2020-01-02"); left out, the whole shared history
    start?: string;
    end?: string;
    rebalance: Rebalance;
    costBps: number;
    strategy: Strategy;
    // Share of the sessions held out at the end as the out-of-sample period (0 for none)
    outOfSample: number;
    capital: number;
};

export type Stats = {
    startDay: string;
    endDay: string;
    sessions: number;
    totalReturn: number;
    // Undefined for periods under a year
    annualReturn?: number;
    // Undefined with fewer than 2 daily returns
    volatility?: number;
    sharpe?: number;
    maxDrawdown: number;
    drawdownPeak?: string;
    drawdownTrough?: string;
    bestDay?: number;
    worstDay?: number;
};

export type Segment = { label: string; portfolio: Stats; benchmark: Stats };

export type BacktestResult = {
    ok: true;
    days: string[];
    // Value at each session's close
    portfolio: number[];
    benchmark: number[];
    drawdown: number[];
    benchmarkDrawdown: number[];
    // The first out-of-sample session, when there's one
    splitDay?: string;
    full: Segment;
    segments: Segment[];
    beta?: number;
    correlation?: number;
    assets: { symbol: string; weight: number; stats: Stats }[];
    // Correlation of daily returns between holdings, in holdings order
    correlations: (number | undefined)[][];
    years: { year: string; portfolio: number; benchmark: number; partial: boolean }[];
    trades: number;
    turnover: number;
    costs: number;
    notes: string[];
};

export type BacktestOutcome = BacktestResult | { ok: false; reason: string };

export const MAX_HOLDINGS = 20;
export const MIN_SESSIONS = 20;
export const TRADING_DAYS = 252;
const DAY_MS = 86_400_000;
const WEIGHT_TOLERANCE = 1e-6;

export const ASSUMPTIONS = [
    "Daily bars from Alpaca (SIP feed, free plan), adjusted for splits and dividends: returns include reinvested dividends.",
    "No look-ahead: decisions use closes up to the previous session; trades fill at the next session's open.",
    "The first purchase is at the first session's open. Costs are charged on every dollar traded; cash earns 0%.",
    "Survivorship: only symbols trading today can be chosen, and delisted companies aren't in the data, which flatters results.",
    "Past results are no guide to future returns. Annualized figures need a year or more; Sharpe uses a 0% risk-free rate.",
];

// ---------- statistics ----------

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

const sampleStd = (values: readonly number[]) => {
    if (values.length < 2) return undefined;
    const m = mean(values);
    return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
};

export const dailyReturns = (values: readonly number[], startValue: number) =>
    values.map((value, i) => value / (i === 0 ? startValue : values[i - 1]) - 1);

// Statistics for closes `values` on `days`, starting from `startValue` (the money in before the first day)
export function computeStats(days: readonly string[], values: readonly number[], startValue: number): Stats {
    const returns = dailyReturns(values, startValue);
    const totalReturn = values[values.length - 1] / startValue - 1;
    // Calendar time from the start of the first session's day to the end of the last
    const years = (dayMs(days[days.length - 1]) - dayMs(days[0]) + DAY_MS) / (365.25 * DAY_MS);
    const std = sampleStd(returns);
    const volatility = std === undefined ? undefined : std * Math.sqrt(TRADING_DAYS);
    const sharpe = std ? (mean(returns) * TRADING_DAYS) / (std * Math.sqrt(TRADING_DAYS)) : undefined;

    let peak = startValue;
    let peakDay = days[0];
    let maxDrawdown = 0;
    let drawdownPeak: string | undefined;
    let drawdownTrough: string | undefined;
    values.forEach((value, i) => {
        if (value > peak) {
            peak = value;
            peakDay = days[i];
        }
        const drawdown = value / peak - 1;
        if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown;
            drawdownPeak = peakDay;
            drawdownTrough = days[i];
        }
    });

    return {
        startDay: days[0],
        endDay: days[days.length - 1],
        sessions: days.length,
        totalReturn,
        annualReturn: years >= 1 ? (1 + totalReturn) ** (1 / years) - 1 : undefined,
        volatility,
        sharpe,
        maxDrawdown,
        drawdownPeak,
        drawdownTrough,
        bestDay: returns.length ? Math.max(...returns) : undefined,
        worstDay: returns.length ? Math.min(...returns) : undefined,
    };
}

// Each close's distance below the highest value so far (the start counts), as a fraction (−0.2 = 20% down)
export const drawdowns = (values: readonly number[], startValue: number) => {
    let peak = startValue;
    return values.map((value) => {
        peak = Math.max(peak, value);
        return value / peak - 1;
    });
};

export function correlation(a: readonly number[], b: readonly number[]): number | undefined {
    if (a.length !== b.length || a.length < 2) return undefined;
    const ma = mean(a);
    const mb = mean(b);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < a.length; i++) {
        cov += (a[i] - ma) * (b[i] - mb);
        va += (a[i] - ma) ** 2;
        vb += (b[i] - mb) ** 2;
    }
    return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : undefined;
}

export function beta(asset: readonly number[], market: readonly number[]): number | undefined {
    if (asset.length !== market.length || asset.length < 2) return undefined;
    const ma = mean(asset);
    const mm = mean(market);
    let cov = 0;
    let vm = 0;
    for (let i = 0; i < asset.length; i++) {
        cov += (asset[i] - ma) * (market[i] - mm);
        vm += (market[i] - mm) ** 2;
    }
    return vm > 0 ? cov / vm : undefined;
}

// ---------- simulation ----------

const periodKey = (day: string, rebalance: Rebalance) => {
    if (rebalance === "monthly") return day.slice(0, 7);
    if (rebalance === "quarterly") return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3)}`;
    if (rebalance === "yearly") return day.slice(0, 4);
    return "";
};

// Position of each day in a series, for lookups
const indexOf = (series: PriceSeries) => new Map(series.days.map((day, i) => [day, i]));

// Whether each holding's close was above its `window`-day average at the last close before each day
function trendSignals(series: PriceSeries, window: number) {
    const above: boolean[] = [];
    let sum = 0;
    series.close.forEach((close, i) => {
        sum += close;
        if (i >= window) sum -= series.close[i - window];
        above.push(i >= window - 1 && close > sum / window);
    });
    // On day i the signal known at the open is the previous bar's
    return (i: number) => (i > 0 ? above[i - 1] : false);
}

type Book = { cash: number; shares: number[] };

type Run = { values: number[]; trades: number; turnover: number; costs: number };

// Runs one portfolio over `days`. weights: target weight per symbol; on(t, k): whether holding k may be held at
// day t's open (always true for buy and hold).
function simulate(
    days: readonly string[],
    opens: readonly (readonly number[])[],
    closes: readonly (readonly number[])[],
    weights: readonly number[],
    rebalance: Rebalance,
    rate: number,
    capital: number,
    on: (t: number, k: number) => boolean
): Run {
    const n = weights.length;
    const book: Book = { cash: capital, shares: new Array(n).fill(0) };
    const run: Run = { values: [], trades: 0, turnover: 0, costs: 0 };
    let state = weights.map((_, k) => on(0, k));

    // Trades holdings to their targets at day t's open; the cost comes out of the portfolio, so the value traded to
    // is solved for: V' = V − rate × Σ|target × V' − current|
    const rebalanceAll = (t: number, targets: readonly number[]) => {
        const held = book.shares.map((shares, k) => shares * opens[k][t]);
        const value = book.cash + held.reduce((sum, v) => sum + v, 0);
        let after = value;
        for (let i = 0; i < 6; i++) after = value - rate * targets.reduce((sum, w, k) => sum + Math.abs(w * after - held[k]), 0);
        targets.forEach((w, k) => {
            const traded = Math.abs(w * after - held[k]);
            if (traded > 1e-9 * value) {
                run.trades++;
                run.turnover += traded;
            }
            book.shares[k] = (w * after) / opens[k][t];
        });
        book.cash = after - targets.reduce((sum, w) => sum + w * after, 0);
        run.costs += value - after;
    };

    for (let t = 0; t < days.length; t++) {
        const next = weights.map((_, k) => on(t, k));
        const targets = weights.map((w, k) => (next[k] ? w : 0));
        if (t === 0 || (rebalance !== "none" && periodKey(days[t - 1], rebalance) !== periodKey(days[t], rebalance))) {
            rebalanceAll(t, targets);
        } else if (next.some((value, k) => value !== state[k])) {
            // A trend switch: only the holdings that switched trade; a buy uses the cash on hand
            const value = book.cash + book.shares.reduce((sum, shares, k) => sum + shares * opens[k][t], 0);
            next.forEach((isOn, k) => {
                if (isOn || isOn === state[k]) return;
                const sold = book.shares[k] * opens[k][t];
                book.cash += sold * (1 - rate);
                run.costs += sold * rate;
                run.turnover += sold;
                run.trades++;
                book.shares[k] = 0;
            });
            next.forEach((isOn, k) => {
                if (!isOn || isOn === state[k]) return;
                const bought = Math.min(weights[k] * value, book.cash / (1 + rate));
                if (bought <= 0) return;
                book.cash -= bought * (1 + rate);
                run.costs += bought * rate;
                run.turnover += bought;
                run.trades++;
                book.shares[k] = bought / opens[k][t];
            });
        }
        state = next;
        run.values.push(book.cash + book.shares.reduce((sum, shares, k) => sum + shares * closes[k][t], 0));
    }
    return run;
}

// ---------- the backtest ----------

export const weightTotal = (holdings: readonly Holding[]) => holdings.reduce((sum, h) => sum + h.weight, 0);

export function runBacktest(input: BacktestInput): BacktestOutcome {
    const { holdings, benchmark, series } = input;
    if (holdings.length === 0) return { ok: false, reason: "Add at least one holding." };
    if (holdings.length > MAX_HOLDINGS) return { ok: false, reason: `Use at most ${MAX_HOLDINGS} holdings.` };
    if (new Set(holdings.map((h) => h.symbol)).size !== holdings.length) return { ok: false, reason: "Each symbol can appear only once." };
    if (holdings.some((h) => !(h.weight > 0))) return { ok: false, reason: "Every weight must be above 0%." };
    if (Math.abs(weightTotal(holdings) - 1) > WEIGHT_TOLERANCE) return { ok: false, reason: "Weights must add up to 100%." };
    if (!(input.costBps >= 0 && input.costBps <= 500)) return { ok: false, reason: "Costs must be between 0 and 500 basis points." };
    if (!(input.outOfSample >= 0 && input.outOfSample <= 0.5)) return { ok: false, reason: "The out-of-sample share must be between 0% and 50%." };
    if (input.strategy.kind === "trend" && !(Number.isInteger(input.strategy.window) && input.strategy.window >= 5 && input.strategy.window <= 400)) {
        return { ok: false, reason: "The moving average must be 5 to 400 sessions." };
    }
    const symbols = [...holdings.map((h) => h.symbol), benchmark];
    const missing = symbols.filter((symbol) => !series[symbol]?.days.length);
    if (missing.length) return { ok: false, reason: `No daily prices for ${[...new Set(missing)].join(", ")}.` };

    // Sessions every holding and the benchmark have a bar for, inside the chosen dates
    const lookups = symbols.map((symbol) => indexOf(series[symbol]));
    const firstDays = symbols.map((symbol) => series[symbol].days[0]);
    const latestStart = firstDays.reduce((a, b) => (a > b ? a : b));
    const days = series[symbols[0]].days.filter(
        (day) => (!input.start || day >= input.start) && (!input.end || day <= input.end) && lookups.every((lookup) => lookup.has(day))
    );
    if (days.length < MIN_SESSIONS) return { ok: false, reason: `Fewer than ${MIN_SESSIONS} sessions with prices for every holding in that range.` };

    const notes: string[] = [];
    if (input.start && days[0] > input.start && latestStart > input.start) {
        const late = symbols.filter((symbol, i) => firstDays[i] === latestStart);
        notes.push(`Starts ${days[0]}, the first session with prices for every holding (${[...new Set(late)].join(", ")} begins ${latestStart}).`);
    }
    const unionSize = new Set(symbols.flatMap((symbol) => series[symbol].days.filter((day) => day >= days[0] && day <= days[days.length - 1]))).size;
    if (unionSize > days.length) notes.push(`${unionSize - days.length} session(s) left out where a holding had no bar (a trading halt or missing data).`);

    const column = (k: number, field: "open" | "close") => days.map((day) => series[symbols[k]][field][lookups[k].get(day)!]);
    const opens = holdings.map((_, k) => column(k, "open"));
    const closes = holdings.map((_, k) => column(k, "close"));
    const rate = input.costBps / 10_000;
    const weights = holdings.map((h) => h.weight);

    let on: (t: number, k: number) => boolean = () => true;
    if (input.strategy.kind === "trend") {
        const window = input.strategy.window;
        const signals = holdings.map((h) => trendSignals(series[h.symbol], window));
        on = (t, k) => signals[k](lookups[k].get(days[t])!);
    }
    const run = simulate(days, opens, closes, weights, input.rebalance, rate, input.capital, on);
    const benchIndex = symbols.length - 1;
    const bench = simulate(days, [column(benchIndex, "open")], [column(benchIndex, "close")], [1], "none", rate, input.capital, () => true);

    // Segments: the whole run, then in-sample and out-of-sample when held out
    const segmentOf = (label: string, from: number, to: number): Segment => {
        const startValue = (values: number[]) => (from === 0 ? input.capital : values[from - 1]);
        return {
            label,
            portfolio: computeStats(days.slice(from, to), run.values.slice(from, to), startValue(run.values)),
            benchmark: computeStats(days.slice(from, to), bench.values.slice(from, to), startValue(bench.values)),
        };
    };
    const full = segmentOf("Whole period", 0, days.length);
    const segments: Segment[] = [];
    let splitDay: string | undefined;
    if (input.outOfSample > 0) {
        const split = Math.round(days.length * (1 - input.outOfSample));
        if (split >= MIN_SESSIONS && days.length - split >= MIN_SESSIONS) {
            splitDay = days[split];
            segments.push(segmentOf("In-sample", 0, split), segmentOf("Out-of-sample", split, days.length));
        } else {
            notes.push(`Too few sessions to hold out ${Math.round(input.outOfSample * 100)}% as out-of-sample (each part needs ${MIN_SESSIONS}).`);
        }
    }

    const portfolioReturns = dailyReturns(run.values, input.capital).slice(1);
    const benchReturns = dailyReturns(bench.values, input.capital).slice(1);

    // Each holding bought at the first open and held, without costs
    const assetReturns = holdings.map((_, k) => dailyReturns(closes[k], closes[k][0]).slice(1));
    const assets = holdings.map((h, k) => ({ symbol: h.symbol, weight: h.weight, stats: computeStats(days, closes[k], opens[k][0]) }));
    const correlations = holdings.map((_, a) => holdings.map((__, b) => (a === b ? 1 : correlation(assetReturns[a], assetReturns[b]))));

    return {
        ok: true,
        days: [...days],
        portfolio: run.values,
        benchmark: bench.values,
        drawdown: drawdowns(run.values, input.capital),
        benchmarkDrawdown: drawdowns(bench.values, input.capital),
        splitDay,
        full,
        segments,
        beta: beta(portfolioReturns, benchReturns),
        correlation: correlation(portfolioReturns, benchReturns),
        assets,
        correlations,
        years: yearlyReturns(days, run.values, bench.values, input.capital),
        trades: run.trades,
        turnover: run.turnover,
        costs: run.costs,
        notes,
    };
}

const lastTradingDayOfYear = (year: string) => {
    let day = `${year}-12-31`;
    for (let i = 0; i < 10 && !isTradingDay(day); i++) day = addDays(day, -1);
    return day;
};

// Calendar-year returns, close of the previous year's last session to close of this year's. The first and last years
// are partial when the run starts after the year's first session or ends before its last.
export function yearlyReturns(days: readonly string[], portfolio: readonly number[], benchmark: readonly number[], capital: number) {
    const years: BacktestResult["years"] = [];
    let from = 0;
    for (let t = 0; t <= days.length; t++) {
        if (t < days.length && (t === from || days[t].slice(0, 4) === days[from].slice(0, 4))) continue;
        const base = (values: readonly number[]) => (from === 0 ? capital : values[from - 1]);
        const year = days[from].slice(0, 4);
        const first = days[from];
        const last = days[t - 1];
        years.push({
            year,
            portfolio: portfolio[t - 1] / base(portfolio) - 1,
            benchmark: benchmark[t - 1] / base(benchmark) - 1,
            partial: (from === 0 && first > nextTradingDay(`${year}-01-01`)) || (t === days.length && last < lastTradingDayOfYear(year)),
        });
        from = t;
    }
    return years;
}
