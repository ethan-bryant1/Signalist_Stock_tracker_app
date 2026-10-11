// The Heatmap page's view settings, kept in the address bar so Back returns to the same view.
// One set of settings covers both views; each view uses the options it can back with real data.

export type HeatmapView = "interactive" | "tradingview";

// What the colors show: a period's price change, or a pre-market or after-hours change
export type ColorBy = "1h" | "4h" | "1d" | "1w" | "1m" | "3m" | "6m" | "ytd" | "1y" | "premarket" | "postmarket";
export type SizeBy = "cap" | "equal" | "volume" | "dollar-volume";
export type GroupBy = "sector" | "none";

export type Option<T extends string> = { value: T; label: string; description: string };

export const PERIOD_OPTIONS: Option<ColorBy>[] = [
    { value: "1h", label: "1H", description: "1-hour change" },
    { value: "4h", label: "4H", description: "4-hour change" },
    { value: "1d", label: "1D", description: "1-day change" },
    { value: "1w", label: "1W", description: "1-week change" },
    { value: "1m", label: "1M", description: "1-month change" },
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

// What the interactive view can show with Finnhub's free plan: today's quote and a daily market cap.
// It has no price history (for other periods), no extended-hours prices and no volume.
export const INTERACTIVE_SUPPORTS = {
    color: new Set<ColorBy>(["1d"]),
    size: new Set<SizeBy>(["cap", "equal"]),
};
export const UNSUPPORTED_REASON = {
    color: "Needs price history, which Finnhub's free plan doesn't include. Available in the Full S&P 500 view.",
    extended: "Needs pre-market and after-hours prices, which Finnhub's free plan doesn't include. Available in the Full S&P 500 view.",
    size: "Needs trading volume, which Finnhub's free plan doesn't include. Available in the Full S&P 500 view.",
};

// TradingView's own names for each setting (its stock heatmap widget's blockColor and blockSize values)
export const TRADINGVIEW_COLOR: Record<ColorBy, string> = {
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

export const DEFAULT_STATE: HeatmapState = { view: "interactive", color: "1d", size: "cap", group: "sector" };

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
    const sector = params.get("sector");
    const symbol = params.get("symbol")?.toUpperCase();
    return {
        view: view === "tradingview" ? "tradingview" : "interactive",
        color: color && COLOR_VALUES.has(color) ? (color as ColorBy) : DEFAULT_STATE.color,
        size: size && SIZE_VALUES.has(size) ? (size as SizeBy) : DEFAULT_STATE.size,
        group: group && GROUP_VALUES.has(group) ? (group as GroupBy) : DEFAULT_STATE.group,
        sector: sector && known.sectors.has(sector) ? sector : undefined,
        symbol: symbol && known.symbols.has(symbol) ? symbol : undefined,
    };
}

// The query string for these settings, leaving out defaults so links stay short
export function serializeHeatmapState(state: HeatmapState): string {
    const params = new URLSearchParams();
    if (state.view !== DEFAULT_STATE.view) params.set("view", state.view);
    if (state.color !== DEFAULT_STATE.color) params.set("color", state.color);
    if (state.size !== DEFAULT_STATE.size) params.set("size", state.size);
    if (state.group !== DEFAULT_STATE.group) params.set("group", state.group);
    if (state.sector) params.set("sector", state.sector);
    if (state.symbol) params.set("symbol", state.symbol);
    const query = params.toString();
    return query ? `?${query}` : "";
}

// The settings the interactive view actually uses: unsupported choices fall back to 1-day change and market cap,
// and the toolbar says so instead of quietly showing something else
export const interactiveSettings = (state: HeatmapState) => ({
    color: INTERACTIVE_SUPPORTS.color.has(state.color) ? state.color : ("1d" as const),
    size: INTERACTIVE_SUPPORTS.size.has(state.size) ? (state.size as "cap" | "equal") : ("cap" as const),
    colorFellBack: !INTERACTIVE_SUPPORTS.color.has(state.color),
    sizeFellBack: !INTERACTIVE_SUPPORTS.size.has(state.size),
});

// Zooming into a sector keeps the selected stock, even one outside that sector, so its details stay open
export const focusSector = (state: HeatmapState, sector?: string): HeatmapState => ({ ...state, view: "interactive", sector });
export const selectStock = (state: HeatmapState, symbol?: string): HeatmapState => ({ ...state, symbol });
