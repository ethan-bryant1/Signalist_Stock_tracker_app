// The Markets page's screener: which stocks it covers (its universe), the filters that apply to each, saved presets
// and the page's address. Pure rules only, no server or browser APIs, so they're unit tested.
//
// Three universes, kept apart so a count or a filter never claims more than its data covers:
// - "us": every US-listed stock, in TradingView's screener embed. We only set the options TradingView documents for
//   it (its preset screen and its column view); its own filters, sorting and figures stay inside its frame.
// - "sp500": the 503 S&P 500 constituents in lib/data/sp500.ts. Sector, industry and search filter that list here;
//   price, market cap and the other figures come from Finnhub through the shared cache, loaded when asked for.
// - "watchlist": one of the user's watchlists, with the Watchlist page's figures.

import { MARKET_SECTORS, SP500_COMPANIES, type MarketSector, type SectorCompany } from "@/lib/data/sp500";
import { createMatcher } from "@/lib/search";
import { COLUMNS, nextSort, type ColumnKey, type SortDir, type SortKey, type WatchRow } from "@/lib/watchlists";

export type Universe = "us" | "sp500" | "watchlist";

export const UNIVERSES: { value: Universe; label: string; short: string }[] = [
    { value: "us", label: "All US-listed stocks", short: "All US" },
    { value: "sp500", label: "S&P 500 constituents", short: "S&P 500" },
    { value: "watchlist", label: "My watchlists", short: "Watchlists" },
];

// ---------- TradingView's screener (universe "us") ----------

// The preset screens and column views TradingView's screener embed accepts for a stock market (its widget builder's
// choices). Our labels say what each one is; the data and the exact rule behind each screen are TradingView's.
export const TV_SCREENS = [
    { value: "most_capitalized", label: "Largest by market cap" },
    { value: "volume_leaders", label: "Volume leaders" },
    { value: "unusual_volume", label: "Unusual volume" },
    { value: "top_gainers", label: "Top gainers" },
    { value: "top_losers", label: "Top losers" },
    { value: "most_volatile", label: "Most volatile" },
    { value: "high_dividend", label: "High dividend" },
    { value: "above_52wk_high", label: "Above 52-week high" },
    { value: "below_52wk_low", label: "Below 52-week low" },
    { value: "monthly_high", label: "New monthly high" },
    { value: "monthly_low", label: "New monthly low" },
    { value: "ath", label: "All-time high" },
    { value: "atl", label: "All-time low" },
    { value: "overbought", label: "Overbought" },
    { value: "oversold", label: "Oversold" },
    { value: "outperforming_SMA50", label: "Above 50-day average" },
    { value: "underperforming_SMA50", label: "Below 50-day average" },
    { value: "earnings_this_week", label: "Earnings this week" },
] as const;

export const TV_VIEWS = [
    { value: "overview", label: "Overview" },
    { value: "performance", label: "Performance" },
    { value: "valuation", label: "Valuation" },
    { value: "dividends", label: "Dividends" },
    { value: "margins", label: "Margins" },
    { value: "income_statement", label: "Income statement" },
    { value: "balance_sheet", label: "Balance sheet" },
    { value: "oscillators", label: "Oscillators" },
    { value: "moving_averages", label: "Moving averages" },
] as const;

export type TvScreen = (typeof TV_SCREENS)[number]["value"];
export type TvView = (typeof TV_VIEWS)[number]["value"];

const isTvScreen = (value: unknown): value is TvScreen => TV_SCREENS.some((screen) => screen.value === value);
const isTvView = (value: unknown): value is TvView => TV_VIEWS.some((view) => view.value === value);

export const tvScreenLabel = (value: TvScreen) => TV_SCREENS.find((screen) => screen.value === value)!.label;
export const tvViewLabel = (value: TvView) => TV_VIEWS.find((view) => view.value === value)!.label;

// ---------- Figure filters (universes "sp500" and "watchlist") ----------

export type RangeKey = "price" | "changePercent" | "marketCap" | "peRatio" | "dividendYield" | "avgVolume";
export type Range = { min?: number; max?: number };
export type Filters = Partial<Record<RangeKey, Range>>;

// Units are what a person types: dollars, percent, billions of dollars, millions of shares
export const RANGE_FILTERS: { key: RangeKey; label: string; unit: string; hint: string }[] = [
    { key: "price", label: "Price", unit: "$", hint: "Last price, in dollars" },
    { key: "changePercent", label: "Day change", unit: "%", hint: "Change from the previous close, in percent" },
    { key: "marketCap", label: "Market cap", unit: "$B", hint: "Market capitalization, in billions of dollars" },
    { key: "peRatio", label: "P/E (TTM)", unit: "×", hint: "Price to trailing 12-month earnings" },
    { key: "dividendYield", label: "Dividend yield", unit: "%", hint: "Indicated annual dividend yield, in percent" },
    { key: "avgVolume", label: "Avg volume (10D)", unit: "M sh", hint: "Average daily volume over 10 days, in millions of shares" },
];

const RANGE_KEYS = RANGE_FILTERS.map((filter) => filter.key);

// A row's figure in the filter's unit, or undefined when it's missing (or doesn't apply, as a fund's P/E)
export const rangeValue = (row: WatchRow, key: RangeKey): number | undefined => {
    const value = (() => {
        switch (key) {
            case "price":
                return row.price;
            case "changePercent":
                return row.changePercent;
            case "marketCap":
                // Finnhub sends millions
                return row.kind === "fund" || row.marketCap === undefined ? undefined : row.marketCap / 1000;
            case "peRatio":
                return row.kind === "fund" ? undefined : row.peRatio;
            case "dividendYield":
                return row.dividendYield;
            case "avgVolume":
                return row.avgVolume;
        }
    })();
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const isActiveRange = (range?: Range) => !!range && (range.min !== undefined || range.max !== undefined);

export const activeRanges = (filters: Filters) => RANGE_KEYS.filter((key) => isActiveRange(filters[key]));

// Rows inside every active range. A row without the figure (missing, not loaded yet, or not applicable) can't be
// checked, so it's left out and counted, never treated as a pass.
export const applyRanges = <R extends WatchRow>(rows: readonly R[], filters: Filters): { kept: R[]; unchecked: number } => {
    const keys = activeRanges(filters);
    if (keys.length === 0) return { kept: [...rows], unchecked: 0 };
    const kept: R[] = [];
    let unchecked = 0;
    for (const row of rows) {
        let pass = true;
        let missing = false;
        for (const key of keys) {
            const value = rangeValue(row, key);
            if (value === undefined) {
                missing = true;
                continue;
            }
            const { min, max } = filters[key]!;
            if ((min !== undefined && value < min) || (max !== undefined && value > max)) pass = false;
        }
        // A row that fails a filter it has a figure for is out, whatever else is missing
        if (!pass) continue;
        if (missing) unchecked += 1;
        else kept.push(row);
    }
    return { kept, unchecked };
};

// ---------- S&P 500 list ----------

export const SECTOR_LABEL = new Map<string, string>(MARKET_SECTORS.map(({ value, label }) => [value, label]));
export const COMPANY_BY_SYMBOL = new Map(SP500_COMPANIES.map((company) => [company.symbol, company]));

const isSector = (value: unknown): value is MarketSector => MARKET_SECTORS.some((sector) => sector.value === value);
const INDUSTRIES = new Set(SP500_COMPANIES.map((company) => company.industry));

// Constituents matching the search, best matches first (then by name), as the header search ranks them
export const searchCompanies = (companies: readonly SectorCompany[], query: string): SectorCompany[] => {
    const text = query.trim();
    if (!text) return [...companies];
    const rank = createMatcher(text);
    return companies
        .map((company) => ({ company, rank: rank(company) }))
        .filter(({ rank }) => rank >= 0)
        .sort((a, b) => a.rank - b.rank)
        .map(({ company }) => company);
};

// How many of the given constituents are in each sector
export const countBySector = (companies: readonly SectorCompany[]) => {
    const counts = new Map<MarketSector, number>();
    for (const company of companies) counts.set(company.sector, (counts.get(company.sector) ?? 0) + 1);
    return counts;
};

// The industries in a sector (or in all of them), with how many of the given constituents are in each, A to Z
export const industriesIn = (companies: readonly SectorCompany[], sector?: MarketSector) => {
    const counts = new Map<string, number>();
    for (const company of companies) if (!sector || company.sector === sector) counts.set(company.industry, (counts.get(company.industry) ?? 0) + 1);
    return [...counts].map(([industry, count]) => ({ industry, count })).sort((a, b) => a.industry.localeCompare(b.industry));
};

// The constituents a state's sector, industry and search leave
export const sp500Matches = (state: Pick<ScreenState, "sector" | "industry" | "query">): SectorCompany[] =>
    searchCompanies(SP500_COMPANIES, state.query).filter((company) => (!state.sector || company.sector === state.sector) && (!state.industry || company.industry === state.industry));

// Figures for S&P 500 stocks load when asked for, at most this many at a time, so one click can't spend the free
// plan's budget for many minutes. Each stock needs up to 3 Finnhub calls (quote, profile, key figures) when nothing
// is cached; profiles keep a day and key figures six hours, so a second load costs mostly quotes.
export const FIGURE_LOAD_LIMIT = 100;
export const CALLS_PER_STOCK = 3;
// The shared budget allows 50 Finnhub calls a minute
export const loadMinutes = (stocks: number) => Math.max(1, Math.ceil((stocks * CALLS_PER_STOCK) / 50));

// ---------- State ----------

export type ScreenSort = { key: SortKey; dir: SortDir };

export type ScreenState = {
    universe: Universe;
    // "us"
    screen: TvScreen;
    view: TvView;
    // "watchlist": which list (the open one when unset)
    listId?: string;
    // "sp500"
    sector?: MarketSector;
    industry?: string;
    // "sp500" and "watchlist"
    query: string;
    filters: Filters;
    sort: ScreenSort;
    columns: ColumnKey[];
};

// Columns the native table can show: the watchlist grid's, plus the S&P 500 list's sector
export const SCREENER_COLUMNS: ColumnKey[] = ["name", "last", "change", "changePercent", "open", "previousClose", "dayLow", "dayHigh", "week52Low", "week52High", "marketCap", "peRatio", "eps", "dividendYield", "avgVolume", "sector", "industry", "exchange", "time"];
export const DEFAULT_SCREEN_COLUMNS: ColumnKey[] = ["name", "last", "change", "changePercent", "marketCap", "peRatio", "dividendYield", "avgVolume", "industry", "time"];

export const DEFAULT_STATE: ScreenState = {
    universe: "us",
    screen: "most_capitalized",
    view: "overview",
    query: "",
    filters: {},
    sort: { key: "marketCap", dir: "desc" },
    columns: DEFAULT_SCREEN_COLUMNS,
};

const MAX_QUERY = 60;
const MAX_LIST_ID = 40;
const isColumnKey = (value: unknown): value is ColumnKey => typeof value === "string" && value in COLUMNS;
const isSortKey = (value: unknown): value is SortKey => value === "symbol" || isColumnKey(value);
const finite = (value: unknown): number | undefined => {
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) && Math.abs(number) < 1e12 ? number : undefined;
};

export const parseRange = (value: unknown): Range | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    let min = finite(raw.min);
    let max = finite(raw.max);
    if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
    if (min === undefined && max === undefined) return undefined;
    return { ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
};

export const parseFilters = (value: unknown): Filters => {
    if (!value || typeof value !== "object") return {};
    const raw = value as Record<string, unknown>;
    const filters: Filters = {};
    for (const key of RANGE_KEYS) {
        const range = parseRange(raw[key]);
        if (range) filters[key] = range;
    }
    return filters;
};

// Anything saved or typed into the address goes through here, so a bad value falls back instead of breaking the page
export const parseState = (value: unknown): ScreenState => {
    if (!value || typeof value !== "object") return DEFAULT_STATE;
    const raw = value as Record<string, unknown>;
    const universe = UNIVERSES.some((u) => u.value === raw.universe) ? (raw.universe as Universe) : DEFAULT_STATE.universe;
    const sector = isSector(raw.sector) ? raw.sector : undefined;
    const industry = typeof raw.industry === "string" && INDUSTRIES.has(raw.industry) ? raw.industry : undefined;
    const sortRaw = (raw.sort && typeof raw.sort === "object" ? raw.sort : {}) as Record<string, unknown>;
    const columns = Array.isArray(raw.columns) ? [...new Set(raw.columns.filter((key): key is ColumnKey => isColumnKey(key) && SCREENER_COLUMNS.includes(key)))] : DEFAULT_STATE.columns;
    return {
        universe,
        screen: isTvScreen(raw.screen) ? raw.screen : DEFAULT_STATE.screen,
        view: isTvView(raw.view) ? raw.view : DEFAULT_STATE.view,
        ...(typeof raw.listId === "string" && raw.listId && raw.listId.length <= MAX_LIST_ID && { listId: raw.listId }),
        ...(sector && { sector }),
        // An industry belongs to one sector; keep it only when it fits the chosen sector
        ...(industry && (!sector || SP500_COMPANIES.some((c) => c.industry === industry && c.sector === sector)) && { industry }),
        query: typeof raw.query === "string" ? raw.query.slice(0, MAX_QUERY) : "",
        filters: parseFilters(raw.filters),
        sort: { key: isSortKey(sortRaw.key) ? sortRaw.key : DEFAULT_STATE.sort.key, dir: sortRaw.dir === "asc" ? "asc" : "desc" },
        columns: columns.length > 0 ? columns : DEFAULT_STATE.columns,
    };
};

// Sort by a column header: the watchlist's rule (numbers high to low first, text A to Z), without its list order
export const nextScreenSort = (current: ScreenSort, key: SortKey): ScreenSort => nextSort(current, key);

// ---------- Address ----------

// Short names for the address, so a screen can be bookmarked and Back from a stock page returns to it
const RANGE_PARAM: Record<RangeKey, string> = { price: "px", changePercent: "chg", marketCap: "cap", peRatio: "pe", dividendYield: "yld", avgVolume: "vol" };

export const paramsFromState = (state: ScreenState): URLSearchParams => {
    const params = new URLSearchParams();
    params.set("u", state.universe);
    if (state.universe === "us") {
        params.set("screen", state.screen);
        params.set("view", state.view);
        return params;
    }
    if (state.universe === "watchlist" && state.listId) params.set("list", state.listId);
    if (state.universe === "sp500") {
        if (state.sector) params.set("sector", state.sector);
        if (state.industry) params.set("industry", state.industry);
    }
    if (state.query.trim()) params.set("q", state.query.trim());
    for (const key of RANGE_KEYS) {
        const range = state.filters[key];
        if (!range) continue;
        params.set(RANGE_PARAM[key], `${range.min ?? ""}~${range.max ?? ""}`);
    }
    params.set("sort", `${state.sort.key}.${state.sort.dir}`);
    params.set("cols", state.columns.join(","));
    return params;
};

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
};

// The state an address describes, or null when it describes none (then the saved last state applies). An address
// with only ?sector= (the dashboard's sector links) opens that sector of the S&P 500.
export const stateFromParams = (params: Params, base: ScreenState = DEFAULT_STATE): ScreenState | null => {
    const universe = one(params, "u");
    const sector = one(params, "sector");
    if (!universe && !sector) return null;
    if (!universe) return parseState({ ...base, universe: "sp500", sector, industry: undefined, query: "", filters: {} });
    const filters: Record<string, Range> = {};
    for (const key of RANGE_KEYS) {
        const raw = one(params, RANGE_PARAM[key]);
        if (!raw) continue;
        const [min, max] = raw.split("~");
        filters[key] = { min: finite(min), max: finite(max) } as Range;
    }
    const [sortKey, sortDir] = (one(params, "sort") ?? "").split(".");
    const cols = one(params, "cols");
    return parseState({
        universe,
        screen: one(params, "screen") ?? base.screen,
        view: one(params, "view") ?? base.view,
        listId: one(params, "list"),
        sector,
        industry: one(params, "industry"),
        query: one(params, "q") ?? "",
        filters,
        sort: sortKey ? { key: sortKey, dir: sortDir } : base.sort,
        columns: cols ? cols.split(",") : base.columns,
    });
};

// ---------- Presets ----------

export const MAX_PRESETS = 30;
export const MAX_PRESET_NAME = 40;

export type Preset = { id: string; name: string; description?: string; state: ScreenState };

const us = (screen: TvScreen, view: TvView): ScreenState => ({ ...DEFAULT_STATE, universe: "us", screen, view });

// Ready-made screens. Each one is a real filter: a TradingView screen (its rule, its data) or a filter of the S&P 500
// list. They can be copied into the user's own presets and changed there.
export const BUILT_IN_PRESETS: Preset[] = [
    { id: "builtin-large-cap", name: "Large-cap leaders", description: "All US stocks, largest market cap first (TradingView)", state: us("most_capitalized", "overview") },
    { id: "builtin-gainers", name: "Market movers: gainers", description: "Biggest gains today, with performance columns (TradingView)", state: us("top_gainers", "performance") },
    { id: "builtin-losers", name: "Market movers: losers", description: "Biggest losses today, with performance columns (TradingView)", state: us("top_losers", "performance") },
    { id: "builtin-volume", name: "High-volume stocks", description: "Most shares traded today (TradingView)", state: us("volume_leaders", "overview") },
    { id: "builtin-unusual-volume", name: "Unusual volume", description: "Volume far above normal, i.e. high relative volume (TradingView)", state: us("unusual_volume", "overview") },
    { id: "builtin-value", name: "Value research", description: "High-dividend stocks with valuation columns (P/E, P/S, EV/EBITDA); narrow further with TradingView's filters", state: us("high_dividend", "valuation") },
    { id: "builtin-oversold", name: "Oversold (technical)", description: "TradingView's oversold screen, with oscillator columns", state: us("oversold", "oscillators") },
    {
        id: "builtin-technology",
        name: "Technology (S&P 500)",
        description: "S&P 500 Information Technology constituents, largest first",
        state: { ...DEFAULT_STATE, universe: "sp500", sector: "Information Technology", sort: { key: "marketCap", dir: "desc" } },
    },
];

export const isBuiltIn = (id: string) => id.startsWith("builtin-");

export type MarketsPrefs = { version: 1; presets: Preset[]; last?: ScreenState; panel: boolean; density: "compact" | "comfortable" };

export const DEFAULT_PREFS: MarketsPrefs = { version: 1, presets: [], panel: true, density: "compact" };

const cleanName = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME) : "");

export const parsePreset = (value: unknown): Preset | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const name = cleanName(raw.name);
    if (typeof raw.id !== "string" || !/^[\w-]{1,40}$/.test(raw.id) || isBuiltIn(raw.id) || !name) return null;
    return { id: raw.id, name, state: parseState(raw.state) };
};

export const parsePrefs = (value: unknown): MarketsPrefs => {
    if (!value || typeof value !== "object") return DEFAULT_PREFS;
    const raw = value as Record<string, unknown>;
    const seen = new Set<string>();
    const presets = (Array.isArray(raw.presets) ? raw.presets : [])
        .map(parsePreset)
        .filter((preset): preset is Preset => !!preset && !seen.has(preset.id) && !!seen.add(preset.id))
        .slice(0, MAX_PRESETS);
    return {
        version: 1,
        presets,
        ...(raw.last !== undefined && { last: parseState(raw.last) }),
        panel: raw.panel !== false,
        density: raw.density === "comfortable" ? "comfortable" : "compact",
    };
};

export type PresetResult = { ok: true; prefs: MarketsPrefs } | { ok: false; error: string };

const nameTaken = (prefs: MarketsPrefs, name: string, exceptId?: string) =>
    [...BUILT_IN_PRESETS, ...prefs.presets].some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === name.toLowerCase());

export const createPreset = (prefs: MarketsPrefs, id: string, name: unknown, state: ScreenState): PresetResult => {
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: "Give the preset a name" };
    if (prefs.presets.length >= MAX_PRESETS) return { ok: false, error: `You can keep up to ${MAX_PRESETS} presets` };
    if (nameTaken(prefs, clean)) return { ok: false, error: `A preset is already called "${clean}"` };
    return { ok: true, prefs: { ...prefs, presets: [...prefs.presets, { id, name: clean, state: parseState(state) }] } };
};

export const renamePreset = (prefs: MarketsPrefs, id: string, name: unknown): PresetResult => {
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: "Give the preset a name" };
    if (!prefs.presets.some((preset) => preset.id === id)) return { ok: false, error: "That preset no longer exists" };
    if (nameTaken(prefs, clean, id)) return { ok: false, error: `A preset is already called "${clean}"` };
    return { ok: true, prefs: { ...prefs, presets: prefs.presets.map((preset) => (preset.id === id ? { ...preset, name: clean } : preset)) } };
};

// Saves the current screen into an existing preset
export const updatePreset = (prefs: MarketsPrefs, id: string, state: ScreenState): PresetResult => {
    if (!prefs.presets.some((preset) => preset.id === id)) return { ok: false, error: "That preset no longer exists" };
    return { ok: true, prefs: { ...prefs, presets: prefs.presets.map((preset) => (preset.id === id ? { ...preset, state: parseState(state) } : preset)) } };
};

export const deletePreset = (prefs: MarketsPrefs, id: string): PresetResult => {
    if (!prefs.presets.some((preset) => preset.id === id)) return { ok: false, error: "That preset no longer exists" };
    return { ok: true, prefs: { ...prefs, presets: prefs.presets.filter((preset) => preset.id !== id) } };
};

// Whether the screen on show is exactly a preset's (so the menu can mark it and offer "Save changes" otherwise)
export const sameScreen = (a: ScreenState, b: ScreenState) => paramsFromState(a).toString() === paramsFromState(b).toString();

// A one-line description of a state, for the preset menu and the page's summary
export const describeState = (state: ScreenState, listName?: string): string => {
    if (state.universe === "us") return `All US · ${tvScreenLabel(state.screen)} · ${tvViewLabel(state.view)}`;
    const parts: string[] = [state.universe === "sp500" ? "S&P 500" : listName ? `Watchlist: ${listName}` : "Watchlist"];
    if (state.sector) parts.push(SECTOR_LABEL.get(state.sector) ?? state.sector);
    if (state.industry) parts.push(state.industry);
    if (state.query.trim()) parts.push(`"${state.query.trim()}"`);
    const ranges = activeRanges(state.filters).length;
    if (ranges > 0) parts.push(`${ranges} figure filter${ranges === 1 ? "" : "s"}`);
    return parts.join(" · ");
};

// The text of an active range, e.g. "P/E (TTM) 0–20×" or "Market cap ≥ $10B"
const RANGE_TEXT: Record<RangeKey, (value: number) => string> = {
    price: (value) => `$${value}`,
    changePercent: (value) => `${value}%`,
    marketCap: (value) => `$${value}B`,
    peRatio: (value) => `${value}×`,
    dividendYield: (value) => `${value}%`,
    avgVolume: (value) => `${value}M sh`,
};

export const describeRange = (key: RangeKey, range: Range) => {
    const { label } = RANGE_FILTERS.find((entry) => entry.key === key)!;
    const text = RANGE_TEXT[key];
    if (range.min !== undefined && range.max !== undefined) return `${label} ${text(range.min)} to ${text(range.max)}`;
    if (range.min !== undefined) return `${label} ≥ ${text(range.min)}`;
    return `${label} ≤ ${text(range.max!)}`;
};
