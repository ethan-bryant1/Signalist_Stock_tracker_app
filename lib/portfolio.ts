// The Portfolio page's saved portfolios and their backtest settings: types, defaults, checks and the date ranges.
// No server or browser APIs, so it's unit tested (tests/portfolio.test.ts).
//
// A portfolio here is a list of symbols with target weights (the app has no holdings or trades), backtested with
// lib/backtest.ts on daily prices. Weights are kept as percentages with up to two decimals.

import { MAX_HOLDINGS, type BacktestInput, type Rebalance } from "@/lib/backtest";
import type { FeedIssue } from "@/lib/market-data";
import { isListSymbol, normalizeListSymbol } from "@/lib/watchlists";

export type Range = "1y" | "3y" | "5y" | "max" | "custom";

export type PortfolioSettings = {
    range: Range;
    // Custom range days ("2020-01-02"), used when range is "custom"
    start?: string;
    end?: string;
    rebalance: Rebalance;
    strategy: "hold" | "trend";
    window: number;
    costBps: number;
    // Percent of the sessions held out at the end
    outOfSample: number;
    benchmark: string;
};

export type PortfolioHolding = { symbol: string; weight: number };
export type Portfolio = { id: string; name: string; holdings: PortfolioHolding[]; settings: PortfolioSettings };
export type PortfolioDoc = { version: 1; activeId: string; portfolios: Portfolio[] };

export const MAX_PORTFOLIOS = 20;
export const MAX_NAME = 40;
export const CAPITAL = 10_000;

export const DEFAULT_SETTINGS: PortfolioSettings = {
    range: "5y",
    rebalance: "quarterly",
    strategy: "hold",
    window: 200,
    costBps: 5,
    outOfSample: 30,
    benchmark: "SPY",
};

export const newPortfolio = (id: string, name = "Portfolio"): Portfolio => ({ id, name, holdings: [], settings: { ...DEFAULT_SETTINGS } });
export const emptyPortfolioDoc = (id: string): PortfolioDoc => ({ version: 1, activeId: id, portfolios: [newPortfolio(id)] });

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const clamp = (value: unknown, low: number, high: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);

export const parseSettings = (value: unknown): PortfolioSettings => {
    const raw = (value ?? {}) as Partial<Record<keyof PortfolioSettings, unknown>>;
    const benchmark = typeof raw.benchmark === "string" ? normalizeListSymbol(raw.benchmark) : "";
    return {
        range: oneOf(raw.range, ["1y", "3y", "5y", "max", "custom"], DEFAULT_SETTINGS.range),
        start: isDay(raw.start) ? raw.start : undefined,
        end: isDay(raw.end) ? raw.end : undefined,
        rebalance: oneOf(raw.rebalance, ["none", "monthly", "quarterly", "yearly"], DEFAULT_SETTINGS.rebalance),
        strategy: oneOf(raw.strategy, ["hold", "trend"], DEFAULT_SETTINGS.strategy),
        window: Math.round(clamp(raw.window, 5, 400, DEFAULT_SETTINGS.window)),
        costBps: clamp(raw.costBps, 0, 500, DEFAULT_SETTINGS.costBps),
        outOfSample: clamp(raw.outOfSample, 0, 50, DEFAULT_SETTINGS.outOfSample),
        benchmark: isListSymbol(benchmark) ? benchmark : DEFAULT_SETTINGS.benchmark,
    };
};

const parsePortfolio = (value: unknown): Portfolio | undefined => {
    const raw = value as Partial<Record<keyof Portfolio, unknown>> | null;
    if (!raw || typeof raw.id !== "string" || !raw.id || raw.id.length > 40 || typeof raw.name !== "string") return undefined;
    const holdings: PortfolioHolding[] = [];
    for (const item of Array.isArray(raw.holdings) ? raw.holdings.slice(0, MAX_HOLDINGS) : []) {
        const symbol = typeof item?.symbol === "string" ? normalizeListSymbol(item.symbol) : "";
        if (!isListSymbol(symbol) || holdings.some((h) => h.symbol === symbol)) continue;
        holdings.push({ symbol, weight: Math.round(clamp(item.weight, 0, 100, 0) * 100) / 100 });
    }
    return { id: raw.id, name: raw.name.trim().slice(0, MAX_NAME) || "Portfolio", holdings, settings: parseSettings(raw.settings) };
};

// A saved document checked field by field; undefined when it isn't one
export const parsePortfolioDoc = (value: unknown): PortfolioDoc | undefined => {
    const raw = value as Partial<PortfolioDoc> | null;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.portfolios)) return undefined;
    const portfolios: Portfolio[] = [];
    for (const item of raw.portfolios.slice(0, MAX_PORTFOLIOS)) {
        const portfolio = parsePortfolio(item);
        if (portfolio && !portfolios.some((p) => p.id === portfolio.id)) portfolios.push(portfolio);
    }
    if (!portfolios.length) return undefined;
    const activeId = portfolios.some((p) => p.id === raw.activeId) ? (raw.activeId as string) : portfolios[0].id;
    return { version: 1, activeId, portfolios };
};

// Equal weights in percent with two decimals that add up to exactly 100 (the remainder goes to the first ones)
export const equalWeights = (count: number): number[] => {
    if (count <= 0) return [];
    const cents = Math.floor(10_000 / count);
    const extra = 10_000 - cents * count;
    return Array.from({ length: count }, (_, i) => (cents + (i < extra ? 1 : 0)) / 100);
};

// The total of the weights in percent, rounded to cents
export const totalWeight = (holdings: readonly PortfolioHolding[]) => Math.round(holdings.reduce((sum, h) => sum + h.weight * 100, 0)) / 100;

// The first session day of a range ending on `lastDay`: the same calendar day 1, 3 or 5 years earlier
export const rangeStart = (settings: PortfolioSettings, lastDay: string): { start?: string; end?: string } => {
    if (settings.range === "custom") return { start: settings.start, end: settings.end };
    if (settings.range === "max") return {};
    const years = settings.range === "1y" ? 1 : settings.range === "3y" ? 3 : 5;
    const [y, m, d] = lastDay.split("-").map(Number);
    // Feb 29 becomes Mar 1 in a year without one
    const date = new Date(Date.UTC(y - years, m - 1, d));
    return { start: date.toISOString().slice(0, 10) };
};

// The symbols whose daily prices a portfolio needs: its holdings and its benchmark
export const neededSymbols = (portfolio: Portfolio) => [...new Set([...portfolio.holdings.map((h) => h.symbol), portfolio.settings.benchmark])];

// The backtest's input for a portfolio, given the loaded prices and the newest day they share
export const backtestInput = (portfolio: Portfolio, series: BacktestInput["series"], lastDay: string): BacktestInput => {
    const { settings } = portfolio;
    return {
        series,
        holdings: portfolio.holdings.map((h) => ({ symbol: h.symbol, weight: h.weight / 100 })),
        benchmark: settings.benchmark,
        ...rangeStart(settings, lastDay),
        rebalance: settings.rebalance,
        costBps: settings.costBps,
        strategy: settings.strategy === "trend" ? { kind: "trend", window: settings.window } : { kind: "hold" },
        outOfSample: settings.outOfSample / 100,
        capital: CAPITAL,
    };
};

// What /api/portfolio/bars sends: each symbol's adjusted daily opens and closes, or why it failed
export type SeriesPayload = { days: string[]; open: number[]; close: number[]; skipped: number; fetchedAt: number; stale: boolean };
export type BarsPayload = { status: "ok" | "not-configured"; series: Record<string, SeriesPayload>; failed: Record<string, FeedIssue> };

// The newest session every one of these series has reached (they're cut there so the run ends on a shared day)
export const sharedLastDay = (series: readonly { days: readonly string[] }[]) =>
    series.reduce<string | undefined>((min, s) => {
        const last = s.days[s.days.length - 1];
        return last && (!min || last < min) ? last : min;
    }, undefined);
