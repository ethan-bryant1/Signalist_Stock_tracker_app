// The stock page's daily price chart (components/chart/PriceChart.tsx): what the server sends, the visible ranges,
// moving averages and the day's change. No server or browser APIs, so it's unit tested (tests/price-chart.test.ts).
//
// The bars are Alpaca's adjusted daily bars (lib/daily-bars.ts says what they are), the same cached copy the
// Portfolio page backtests on. Every figure here is computed from them; nothing is filled in.

import type { DailyBars } from "@/lib/daily-bars";
import type { FeedIssue } from "@/lib/market-data";

export type ChartPayload =
    | { status: "ok"; symbol: string; bars: DailyBars; skipped: number; fetchedAt: number; stale: boolean }
    // Alpaca has no daily bars for the symbol (not a US-listed stock or fund, or a bad symbol)
    | { status: "no-bars"; symbol: string }
    | { status: "not-configured" }
    | { status: "failed"; issue: FeedIssue };

export const CHART_RANGES = [
    { id: "3m", label: "3M", months: 3 },
    { id: "6m", label: "6M", months: 6 },
    { id: "ytd", label: "YTD" },
    { id: "1y", label: "1Y", months: 12 },
    { id: "5y", label: "5Y", months: 60 },
    { id: "max", label: "Max" },
] as const;

export type ChartRange = (typeof CHART_RANGES)[number]["id"];
export const DEFAULT_RANGE: ChartRange = "1y";

export const isChartRange = (value: unknown): value is ChartRange => CHART_RANGES.some((range) => range.id === value);

export const MOVING_AVERAGES = [50, 200] as const;

const pad = (n: number) => String(n).padStart(2, "0");

// The same calendar day `months` earlier ("2026-03-31" less one month is "2026-02-28")
export const monthsBefore = (day: string, months: number) => {
    const [year, month, date] = day.split("-").map(Number);
    const total = year * 12 + (month - 1) - months;
    const y = Math.floor(total / 12);
    const m = total - y * 12 + 1;
    const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${pad(m)}-${pad(Math.min(date, lastDate))}`;
};

// The index of the first bar a range shows, counted back from the newest bar's day (not today), so a range always
// ends on the newest final bar. 1Y from 2026-10-13 starts after 2025-10-13; YTD starts on the year's first session.
export function rangeStartIndex(days: readonly string[], range: ChartRange): number {
    const last = days.at(-1);
    if (!last || range === "max") return 0;
    const spec = CHART_RANGES.find((item) => item.id === range)!;
    const after = "months" in spec ? monthsBefore(last, spec.months) : undefined;
    const from = range === "ytd" ? `${last.slice(0, 4)}-01-01` : undefined;
    const index = days.findIndex((day) => (after ? day > after : day >= from!));
    return index < 0 ? 0 : index;
}

// The simple average of the last `length` closes at each session; undefined until there are enough sessions
export function simpleMovingAverage(values: readonly number[], length: number): (number | undefined)[] {
    const out: (number | undefined)[] = [];
    let sum = 0;
    values.forEach((value, i) => {
        sum += value;
        if (i >= length) sum -= values[i - length];
        out.push(i >= length - 1 ? sum / length : undefined);
    });
    return out;
}

// Bollinger Bands: the `length`-session simple average of the close (middle) plus and minus `width` standard
// deviations of the same closes (upper, lower). The standard deviation is the population one (divide by `length`), as
// Bollinger defines it and TradingView draws it. Undefined until there are `length` closes.
export const BOLLINGER = { length: 20, width: 2 } as const;

export type Bands = { upper: number; middle: number; lower: number };

export function bollingerBands(values: readonly number[], length: number = BOLLINGER.length, width: number = BOLLINGER.width): (Bands | undefined)[] {
    return simpleMovingAverage(values, length).map((middle, i) => {
        if (middle === undefined) return undefined;
        let squares = 0;
        for (let j = i - length + 1; j <= i; j++) squares += (values[j] - middle) ** 2;
        const spread = width * Math.sqrt(squares / length);
        return { upper: middle + spread, middle, lower: middle - spread };
    });
}

// Wilder's Relative Strength Index, 0 to 100. The first average gain and loss are the simple averages of the first
// `length` session changes; after that each is smoothed as (previous × (length − 1) + today) / length. RSI is
// 100 − 100 / (1 + average gain / average loss); with no losses it is 100 and with no gains 0 (TradingView's
// convention, also when the closes never move). Undefined for the first `length` sessions.
export const RSI_LENGTH = 14;
export const RSI_LEVELS = [70, 30] as const;

export function relativeStrengthIndex(values: readonly number[], length: number = RSI_LENGTH): (number | undefined)[] {
    const out: (number | undefined)[] = values.map(() => undefined);
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const up = Math.max(change, 0);
        const down = Math.max(-change, 0);
        if (i <= length) {
            gain += up / length;
            loss += down / length;
        } else {
            gain = (gain * (length - 1) + up) / length;
            loss = (loss * (length - 1) + down) / length;
        }
        if (i >= length) out[i] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
    }
    return out;
}

// A session's change from the previous session's close, (c1 − c0) / c0, as a percentage; undefined for the first bar
export function dayChangePercent(close: readonly number[], index: number): number | undefined {
    if (index <= 0 || index >= close.length) return undefined;
    const previous = close[index - 1];
    return previous > 0 ? ((close[index] - previous) / previous) * 100 : undefined;
}

// How the viewer last left the stock page's chart, remembered in this browser (hooks/useChartSettings.ts). The
// TradingView chart stays the default source.
export type ChartSettings = {
    source: "tradingview" | "daily";
    range: ChartRange;
    style: "candles" | "line";
    // Moving averages shown, by length
    averages: number[];
    // Studies shown: Bollinger Bands on the price, RSI in its own pane (both off until chosen)
    indicators: ChartIndicator[];
};

export const CHART_INDICATORS = ["bollinger", "rsi"] as const;
export type ChartIndicator = (typeof CHART_INDICATORS)[number];

export const DEFAULT_CHART_SETTINGS: ChartSettings = { source: "tradingview", range: DEFAULT_RANGE, style: "candles", averages: [50, 200], indicators: [] };

// Settings from storage; anything unknown falls back to its default
export function parseChartSettings(raw: unknown): ChartSettings {
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const averages = Array.isArray(value.averages)
        ? MOVING_AVERAGES.filter((length) => (value.averages as unknown[]).includes(length))
        : DEFAULT_CHART_SETTINGS.averages;
    return {
        source: value.source === "daily" ? "daily" : "tradingview",
        range: isChartRange(value.range) ? value.range : DEFAULT_RANGE,
        style: value.style === "line" ? "line" : "candles",
        averages,
        indicators: Array.isArray(value.indicators) ? CHART_INDICATORS.filter((id) => (value.indicators as unknown[]).includes(id)) : [],
    };
}
