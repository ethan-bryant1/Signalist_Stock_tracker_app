// The Heatmap page's view settings, kept in the address bar so Back returns to the same view.
// One set of settings covers both views; each view uses the options it can back with real data.

import type { HistoryPeriod } from "@/lib/market-data";

export type HeatmapView = "interactive" | "tradingview";

// What the colors show: a period's price change, or a pre-market or after-hours change
export type ColorBy = "1h" | "4h" | "1d" | "1w" | "1m" | "mtd" | "3m" | "6m" | "ytd" | "1y" | "premarket" | "postmarket";
export type SizeBy = "cap" | "equal" | "volume" | "dollar-volume";
export type GroupBy = "sector" | "none";

export type Option<T extends string> = { value: T; label: string; description: string };

export const PERIOD_OPTIONS: Option<ColorBy>[] = [
    { value: "1h", label: "1H", description: "1-hour change" },
    { value: "4h", label: "4H", description: "4-hour change" },
    { value: "1d", label: "1D", description: "1-day change" },
    { value: "1w", label: "1W", description: "1-week change" },
    { value: "1m", label: "1M", description: "1-month change" },
    { value: "mtd", label: "MTD", description: "month-to-date change" },
    { value: "3m", label: "3M", description: "3-month change" },
    { value: "6m", label: "6M", description: "6-month change" },
    { value: "ytd", label: "YTD", description: "year-to-date change" },
    { value: "1y", label: "1Y", description: "1-year change" },
];

export const EXTENDED_HOURS_OPTIONS: Option<ColorBy>[] = [
    { value: "premarket", label: "Pre-market", description: "pre-market change" },
    { value: "postmarket", label: "After hours", description: "after-hours change" },
];

export const SIZE_OPTIONS: Option<SizeBy>[] = [
    { value: "cap", label: "Market cap", description: "market cap" },
    { value: "equal", label: "Equal", description: "equal size" },
    { value: "volume", label: "Volume", description: "1-day share volume" },
    { value: "dollar-volume", label: "$ Volume", description: "1-day dollar volume (price × volume)" },
];

export const GROUP_OPTIONS: Option<GroupBy>[] = [
    { value: "sector", label: "Sectors", description: "grouped by sector" },
    { value: "none", label: "None", description: "not grouped" },
];

// What the interactive view can show. With Finnhub's free plan alone: today's quote, a daily market cap, and daily
// stats with each stock's return over several periods and its 10-day average volume (lib/period-change.ts); it has
// no 1-month return (only month to date), no intraday history and no extended-hours prices. A free Alpaca account
// adds 1H, 4H, 1M, pre-market and after hours, and today's volume (lib/alpaca.ts).
const FINNHUB_COLORS: ColorBy[] = ["1d", "1w", "mtd", "3m", "6m", "ytd", "1y"];
const ALPACA_COLORS: ColorBy[] = ["1h", "4h", "1m", "premarket", "postmarket"];

export const interactiveSupports = (alpaca: boolean) => ({
    color: new Set<ColorBy>(alpaca ? [...FINNHUB_COLORS, ...ALPACA_COLORS] : FINNHUB_COLORS),
    size: new Set<SizeBy>(["cap", "equal", "volume", "dollar-volume"]),
});

// Without Alpaca the volume sizes are 10-day averages, so the options say so; with it they're today's, like TradingView's
export const interactiveSizeOptions = (alpaca: boolean): Option<SizeBy>[] =>
    SIZE_OPTIONS.map((option) =>
        option.value === "volume"
            ? alpaca
                ? { value: "volume", label: "Volume", description: "today's share volume (to 15 minutes ago)" }
                : { value: "volume", label: "Avg volume", description: "10-day average share volume" }
            : option.value === "dollar-volume"
                ? alpaca
                    ? { value: "dollar-volume", label: "$ Volume", description: "today's dollar volume (to 15 minutes ago)" }
                    : { value: "dollar-volume", label: "Avg $ volume", description: "10-day average dollar volume (live price × average volume)" }
                : option
    );

// TradingView's own names for each setting (its stock heatmap widget's blockColor and blockSize values)
// TradingView has no month-to-date figure, so its view doesn't offer MTD
export const TRADINGVIEW_COLOR: Partial<Record<ColorBy, string>> = {
    "1h": "change|60",
    "4h": "change|240",
    "1d": "change",
    "1w": "Perf.W",
    "1m": "Perf.1M",
    "3m": "Perf.3M",
    "6m": "Perf.6M",
    ytd: "Perf.YTD",
    "1y": "Perf.Y",
    premarket: "premarket_change",
    postmarket: "postmarket_change",
};
export const TRADINGVIEW_SIZE: Record<SizeBy, { blockSize: string; isMonoSize: boolean }> = {
    cap: { blockSize: "market_cap_basic", isMonoSize: false },
    // TradingView's "mono size": every block the same size, still ordered by market cap
    equal: { blockSize: "market_cap_basic", isMonoSize: true },
    volume: { blockSize: "volume", isMonoSize: false },
    "dollar-volume": { blockSize: "Value.Traded", isMonoSize: false },
};
export const TRADINGVIEW_GROUP: Record<GroupBy, string> = { sector: "sector", none: "no_group" };

export type HeatmapState = {
    view: HeatmapView;
    color: ColorBy;
    size: SizeBy;
    group: GroupBy;
    // The sector the interactive map is zoomed into (a GICS sector name)
    sector?: string;
    // The stock selected in the interactive map
    symbol?: string;
};

// The Heatmap page opens on TradingView's full S&P 500 map; the dashboard already shows the Market Snapshot
export const DEFAULT_STATE: HeatmapState = { view: "tradingview", color: "1d", size: "cap", group: "sector" };

const COLOR_VALUES = new Set<string>([...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS].map(({ value }) => value));
const SIZE_VALUES = new Set<string>(SIZE_OPTIONS.map(({ value }) => value));
const GROUP_VALUES = new Set<string>(GROUP_OPTIONS.map(({ value }) => value));

type Params = { get(name: string): string | null };

// Reads the settings from the address bar. Anything unknown falls back to the default, so a stale or
// hand-edited link still opens a working view.
export function parseHeatmapState(params: Params, known: { sectors: ReadonlySet<string>; symbols: ReadonlySet<string> }): HeatmapState {
    const view = params.get("view");
    const color = params.get("color");
    const size = params.get("size");
    const group = params.get("group");
    const rawSector = params.get("sector");
    const rawSymbol = params.get("symbol")?.toUpperCase();
    const sector = rawSector && known.sectors.has(rawSector) ? rawSector : undefined;
    const symbol = rawSymbol && known.symbols.has(rawSymbol) ? rawSymbol : undefined;
    return {
        // A link naming a sector or stock (like the dashboard's sector headings) means the Market Snapshot, which
        // is the view that can focus them
        view: view === "tradingview" || view === "interactive" ? view : sector || symbol ? "interactive" : DEFAULT_STATE.view,
        color: color && COLOR_VALUES.has(color) ? (color as ColorBy) : DEFAULT_STATE.color,
        size: size && SIZE_VALUES.has(size) ? (size as SizeBy) : DEFAULT_STATE.size,
        group: group && GROUP_VALUES.has(group) ? (group as GroupBy) : DEFAULT_STATE.group,
        sector,
        symbol,
    };
}

// The query string for these settings, leaving out defaults so links stay short
export function serializeHeatmapState(state: HeatmapState): string {
    const params = new URLSearchParams();
    // A sector or stock in the link implies the Market Snapshot, so the view is written whenever one is there
    if (state.view !== DEFAULT_STATE.view || state.sector || state.symbol) params.set("view", state.view);
    if (state.color !== DEFAULT_STATE.color) params.set("color", state.color);
    if (state.size !== DEFAULT_STATE.size) params.set("size", state.size);
    if (state.group !== DEFAULT_STATE.group) params.set("group", state.group);
    if (state.sector) params.set("sector", state.sector);
    if (state.symbol) params.set("symbol", state.symbol);
    const query = params.toString();
    return query ? `?${query}` : "";
}

export type InteractiveColor = "1d" | HistoryPeriod | "premarket" | "postmarket";

// The settings the interactive view actually uses: unsupported choices fall back to 1-day change and market cap,
// and the toolbar says so instead of quietly showing something else
export const interactiveSettings = (state: HeatmapState, alpaca = false) => {
    const supports = interactiveSupports(alpaca);
    return {
        color: supports.color.has(state.color) ? (state.color as InteractiveColor) : ("1d" as const),
        size: supports.size.has(state.size) ? state.size : ("cap" as const),
        colorFellBack: !supports.color.has(state.color),
        sizeFellBack: !supports.size.has(state.size),
    };
};

// Zooming into a sector keeps the selected stock, even one outside that sector, so its details stay open
export const focusSector = (state: HeatmapState, sector?: string): HeatmapState => ({ ...state, view: "interactive", sector });
export const selectStock = (state: HeatmapState, symbol?: string): HeatmapState => ({ ...state, symbol });
