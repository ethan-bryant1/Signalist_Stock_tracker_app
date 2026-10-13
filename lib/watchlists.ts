// Watchlists: named lists of symbols, like the tabs of IBKR Mosaic's watchlist window, and the grid's columns and
// sorting. Pure rules only (operations, validation of saved data, sorting), no server or browser APIs.

import type { InstrumentKind } from "@/lib/instrument";
import type { FeedIssue } from "@/lib/market-data";

export const MAX_LISTS = 20;
export const MAX_ITEMS = 500;
export const MAX_NAME = 40;
export const DEFAULT_LIST_NAME = "Watchlist";

export type WatchItem = { symbol: string; company: string; addedAt: number };
export type WatchList = { id: string; name: string; items: WatchItem[] };

// ---------- Columns ----------

export type ColumnKey =
    | "name"
    | "last"
    | "change"
    | "changePercent"
    | "open"
    | "previousClose"
    | "dayLow"
    | "dayHigh"
    | "week52Low"
    | "week52High"
    | "marketCap"
    | "peRatio"
    | "eps"
    | "dividendYield"
    | "avgVolume"
    | "industry"
    | "exchange"
    | "time";

// One stock's figures as the grid shows them. Every figure is optional: a missing one shows as a dash.
export type WatchRow = {
    symbol: string;
    kind: InstrumentKind;
    name?: string;
    exchange?: string;
    industry?: string;
    currency: string;
    price?: number;
    change?: number;
    changePercent?: number;
    open?: number;
    previousClose?: number;
    dayLow?: number;
    dayHigh?: number;
    week52Low?: number;
    week52High?: number;
    marketCap?: number; // millions, as Finnhub sends it
    peRatio?: number;
    eps?: number;
    dividendYield?: number; // percent
    avgVolume?: number; // 10-day average, millions of shares
    // When the price was set (ms), whether it came from our cache because a fresh copy failed, and why figures are missing
    quoteTime?: number;
    cached?: boolean;
    issue?: FeedIssue;
    // Why the key figures (from Finnhub's metric endpoint) are missing, when they didn't load
    figuresIssue?: FeedIssue;
    // When the server put this row together (ms)
    checkedAt: number;
};

// The key figures alone, to fill in a row whose price is already there
export type WatchFigures = Pick<WatchRow, "symbol" | "week52Low" | "week52High" | "peRatio" | "eps" | "dividendYield" | "avgVolume" | "figuresIssue">;

// A row with fresh key figures; a figure that failed again keeps nothing made up, just the dash
export const withFigures = (row: WatchRow, figures: WatchFigures): WatchRow => ({ ...row, ...figures, symbol: row.symbol });

type ColumnDef = {
    label: string;
    // Header text; label is used in the column picker and for screen readers
    short: string;
    align: "left" | "right";
    // Figures that describe an operating company, which a fund doesn't have
    stockOnly?: boolean;
    // From Finnhub's key figures, which a long list loads after its prices
    fromMetrics?: boolean;
    value: (row: WatchRow) => number | string | undefined;
};

export const COLUMNS: Record<ColumnKey, ColumnDef> = {
    name: { label: "Name", short: "Name", align: "left", value: (row) => row.name },
    last: { label: "Last price", short: "Last", align: "right", value: (row) => row.price },
    change: { label: "Change", short: "Chg", align: "right", value: (row) => row.change },
    changePercent: { label: "Change %", short: "Chg %", align: "right", value: (row) => row.changePercent },
    open: { label: "Open", short: "Open", align: "right", value: (row) => row.open },
    previousClose: { label: "Previous close", short: "Prev close", align: "right", value: (row) => row.previousClose },
    dayLow: { label: "Day low", short: "Low", align: "right", value: (row) => row.dayLow },
    dayHigh: { label: "Day high", short: "High", align: "right", value: (row) => row.dayHigh },
    week52Low: { label: "52-week low", short: "52W low", align: "right", fromMetrics: true, value: (row) => row.week52Low },
    week52High: { label: "52-week high", short: "52W high", align: "right", fromMetrics: true, value: (row) => row.week52High },
    marketCap: { label: "Market cap", short: "Mkt cap", align: "right", stockOnly: true, value: (row) => row.marketCap },
    peRatio: { label: "P/E ratio (TTM)", short: "P/E", align: "right", stockOnly: true, fromMetrics: true, value: (row) => row.peRatio },
    eps: { label: "EPS (TTM)", short: "EPS", align: "right", stockOnly: true, fromMetrics: true, value: (row) => row.eps },
    dividendYield: { label: "Dividend yield", short: "Div yld", align: "right", fromMetrics: true, value: (row) => row.dividendYield },
    avgVolume: { label: "Average volume (10 days)", short: "Avg vol 10D", align: "right", fromMetrics: true, value: (row) => row.avgVolume },
    industry: { label: "Industry", short: "Industry", align: "left", value: (row) => row.industry },
    exchange: { label: "Exchange", short: "Exch", align: "left", value: (row) => row.exchange },
    time: { label: "Price time", short: "Time", align: "right", value: (row) => row.quoteTime },
};

export const COLUMN_KEYS = Object.keys(COLUMNS) as ColumnKey[];
export const DEFAULT_COLUMNS: ColumnKey[] = ["name", "last", "change", "changePercent", "dayLow", "dayHigh", "marketCap", "peRatio", "avgVolume", "time"];

// Whether a figure applies to this kind of instrument: a fund has no market cap, earnings or P/E of its own
export const columnApplies = (key: ColumnKey, kind: InstrumentKind) => !(COLUMNS[key].stockOnly && kind === "fund");

// ---------- Preferences ----------

export type SortKey = "manual" | "symbol" | ColumnKey;
export type SortDir = "asc" | "desc";
export type Density = "compact" | "comfortable";
export type WatchlistPrefs = { columns: ColumnKey[]; sort: { key: SortKey; dir: SortDir }; density: Density; panel: boolean };

export const DEFAULT_PREFS: WatchlistPrefs = { columns: DEFAULT_COLUMNS, sort: { key: "manual", dir: "asc" }, density: "compact", panel: true };

const isColumnKey = (value: unknown): value is ColumnKey => typeof value === "string" && value in COLUMNS;
const isSortKey = (value: unknown): value is SortKey => value === "manual" || value === "symbol" || isColumnKey(value);

export const parsePrefs = (value: unknown): WatchlistPrefs => {
    if (!value || typeof value !== "object") return DEFAULT_PREFS;
    const raw = value as Record<string, unknown>;
    const columns = Array.isArray(raw.columns) ? [...new Set(raw.columns.filter(isColumnKey))] : DEFAULT_PREFS.columns;
    const sortRaw = (raw.sort && typeof raw.sort === "object" ? raw.sort : {}) as Record<string, unknown>;
    return {
        columns,
        sort: { key: isSortKey(sortRaw.key) ? sortRaw.key : "manual", dir: sortRaw.dir === "desc" ? "desc" : "asc" },
        density: raw.density === "comfortable" ? "comfortable" : "compact",
        panel: raw.panel !== false,
    };
};

// Shows or hides a column; a shown column goes back where the default order puts it
export const toggleColumn = (columns: readonly ColumnKey[], key: ColumnKey): ColumnKey[] => {
    if (columns.includes(key)) return columns.filter((column) => column !== key);
    const rank = (column: ColumnKey) => COLUMN_KEYS.indexOf(column);
    const at = columns.findIndex((column) => rank(column) > rank(key));
    return at === -1 ? [...columns, key] : [...columns.slice(0, at), key, ...columns.slice(at)];
};

export const moveColumn = (columns: readonly ColumnKey[], key: ColumnKey, direction: -1 | 1): ColumnKey[] => {
    const from = columns.indexOf(key);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= columns.length) return [...columns];
    const next = [...columns];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
};

// Clicking a header sorts by it, then flips the direction; numbers start high-to-low, text A to Z
export const nextSort = (current: WatchlistPrefs["sort"], key: SortKey): WatchlistPrefs["sort"] => {
    if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
    const textual = key === "symbol" || key === "manual" || (key !== "time" && COLUMNS[key as ColumnKey]?.align === "left");
    return { key, dir: textual ? "asc" : "desc" };
};

// ---------- Sorting ----------

const sortValue = (row: WatchRow, key: SortKey): number | string | undefined => {
    if (key === "symbol") return row.symbol;
    if (key === "manual") return undefined;
    if (!columnApplies(key, row.kind)) return undefined;
    const value = COLUMNS[key].value(row);
    return typeof value === "number" && !Number.isFinite(value) ? undefined : value;
};

// Rows in the list's own order, or sorted by a column. Missing figures always go last, whichever the direction,
// and ties keep the list's order.
export const sortRows = <R extends WatchRow>(rows: readonly R[], sort: WatchlistPrefs["sort"]): R[] => {
    if (sort.key === "manual") return [...rows];
    const sign = sort.dir === "asc" ? 1 : -1;
    return rows
        .map((row, index) => ({ row, index, value: sortValue(row, sort.key) }))
        .sort((a, b) => {
            if (a.value === undefined || b.value === undefined) {
                if (a.value === b.value) return a.index - b.index;
                return a.value === undefined ? 1 : -1;
            }
            const diff = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : String(a.value).localeCompare(String(b.value));
            return diff === 0 ? a.index - b.index : diff * sign;
        })
        .map(({ row }) => row);
};

// Keeps rows whose symbol, name or industry contains the text
export const filterRows = <R extends WatchRow>(rows: readonly R[], text: string): R[] => {
    const query = text.trim().toLowerCase();
    if (!query) return [...rows];
    return rows.filter((row) => [row.symbol, row.name, row.industry].some((value) => value?.toLowerCase().includes(query)));
};

// ---------- Lists ----------

export type WatchlistDoc = { version: 1; activeId: string; lists: WatchList[]; prefs: WatchlistPrefs };
export type OpResult = { ok: true; doc: WatchlistDoc } | { ok: false; error: string };

export const isListSymbol = (value: unknown): value is string => typeof value === "string" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(value);
export const normalizeListSymbol = (value: string) => value.trim().toUpperCase().replace(/^[A-Z]+:/, "");

const cleanName = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "");

export const uniqueListName = (names: readonly string[], base: string) => {
    const taken = new Set(names.map((name) => name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
};

export const activeList = (doc: WatchlistDoc) => doc.lists.find((list) => list.id === doc.activeId) ?? doc.lists[0];

export const emptyDoc = (id: string): WatchlistDoc => ({ version: 1, activeId: id, lists: [{ id, name: DEFAULT_LIST_NAME, items: [] }], prefs: DEFAULT_PREFS });

// The single list from before lists existed (one saved document per stock), newest first as that page showed it
export const fromLegacy = (items: readonly { symbol: string; company?: string; addedAt?: Date | number }[], id: string): WatchlistDoc => {
    const doc = emptyDoc(id);
    const seen = new Set<string>();
    const entries: WatchItem[] = [];
    for (const item of [...items].sort((a, b) => Number(b.addedAt ?? 0) - Number(a.addedAt ?? 0))) {
        const symbol = normalizeListSymbol(String(item.symbol ?? ""));
        if (!isListSymbol(symbol) || seen.has(symbol) || entries.length >= MAX_ITEMS) continue;
        seen.add(symbol);
        entries.push({ symbol, company: cleanCompany(item.company, symbol), addedAt: Number(item.addedAt ?? 0) || 0 });
    }
    doc.lists[0].items = entries;
    return doc;
};

const cleanCompany = (value: unknown, symbol: string) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : symbol);

const withList = (doc: WatchlistDoc, listId: string, change: (list: WatchList) => WatchList | string): OpResult => {
    const list = doc.lists.find((entry) => entry.id === listId);
    if (!list) return { ok: false, error: "That list no longer exists" };
    const next = change(list);
    if (typeof next === "string") return { ok: false, error: next };
    return { ok: true, doc: { ...doc, lists: doc.lists.map((entry) => (entry.id === listId ? next : entry)) } };
};

export const createList = (doc: WatchlistDoc, name: string, id: string): OpResult => {
    if (doc.lists.length >= MAX_LISTS) return { ok: false, error: `Up to ${MAX_LISTS} lists` };
    const names = doc.lists.map((list) => list.name);
    const clean = cleanName(name) || "New list";
    const list = { id, name: uniqueListName(names, clean), items: [] };
    return { ok: true, doc: { ...doc, activeId: id, lists: [...doc.lists, list] } };
};

export const renameList = (doc: WatchlistDoc, listId: string, name: string): OpResult => {
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: "Give the list a name" };
    if (doc.lists.some((list) => list.id !== listId && list.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: `There's already a list called ${clean}` };
    return withList(doc, listId, (list) => ({ ...list, name: clean }));
};

export const deleteList = (doc: WatchlistDoc, listId: string): OpResult => {
    const index = doc.lists.findIndex((list) => list.id === listId);
    if (index === -1) return { ok: false, error: "That list no longer exists" };
    if (doc.lists.length === 1) return { ok: false, error: "Keep at least one list" };
    const lists = doc.lists.filter((list) => list.id !== listId);
    const activeId = doc.activeId === listId ? lists[Math.min(index, lists.length - 1)].id : doc.activeId;
    return { ok: true, doc: { ...doc, activeId, lists } };
};

export const setActiveList = (doc: WatchlistDoc, listId: string): OpResult =>
    doc.lists.some((list) => list.id === listId) ? { ok: true, doc: { ...doc, activeId: listId } } : { ok: false, error: "That list no longer exists" };

// Adds a symbol to a list, at the end or at a position (to undo a removal). A list holds each symbol once.
export const addItem = (doc: WatchlistDoc, listId: string, symbol: string, company: string, now: number, index?: number): OpResult => {
    const clean = normalizeListSymbol(symbol);
    if (!isListSymbol(clean)) return { ok: false, error: `${symbol.trim() || "That"} isn't a ticker` };
    return withList(doc, listId, (list) => {
        if (list.items.some((item) => item.symbol === clean)) return `${clean} is already in ${list.name}`;
        if (list.items.length >= MAX_ITEMS) return `A list holds up to ${MAX_ITEMS} symbols`;
        const item = { symbol: clean, company: cleanCompany(company, clean), addedAt: now };
        const at = index === undefined ? list.items.length : Math.max(0, Math.min(index, list.items.length));
        return { ...list, items: [...list.items.slice(0, at), item, ...list.items.slice(at)] };
    });
};

export const removeItem = (doc: WatchlistDoc, listId: string, symbol: string): OpResult =>
    withList(doc, listId, (list) => {
        if (!list.items.some((item) => item.symbol === symbol)) return `${symbol} isn't in ${list.name}`;
        return { ...list, items: list.items.filter((item) => item.symbol !== symbol) };
    });

// Moves a symbol to a new position in the list's own order
export const moveItem = (doc: WatchlistDoc, listId: string, symbol: string, toIndex: number): OpResult =>
    withList(doc, listId, (list) => {
        const from = list.items.findIndex((item) => item.symbol === symbol);
        if (from === -1) return `${symbol} isn't in ${list.name}`;
        const items = list.items.filter((item) => item.symbol !== symbol);
        const at = Math.max(0, Math.min(Math.round(toIndex), items.length));
        items.splice(at, 0, list.items[from]);
        return { ...list, items };
    });

export const setPrefs = (doc: WatchlistDoc, prefs: unknown): OpResult => ({ ok: true, doc: { ...doc, prefs: parsePrefs(prefs) } });

// Every symbol in any list, each once (the daily news email covers them all)
export const allSymbols = (doc: WatchlistDoc) => [...new Set(doc.lists.flatMap((list) => list.items.map((item) => item.symbol)))];

// Checks saved data field by field, dropping anything unknown or out of range
export const parseDoc = (value: unknown): WatchlistDoc | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    if (raw.version !== 1 || !Array.isArray(raw.lists)) return undefined;
    const lists: WatchList[] = [];
    for (const entry of raw.lists.slice(0, MAX_LISTS)) {
        if (!entry || typeof entry !== "object") continue;
        const rawList = entry as Record<string, unknown>;
        const id = typeof rawList.id === "string" && /^[\w-]{1,40}$/.test(rawList.id) ? rawList.id : undefined;
        const name = cleanName(rawList.name);
        if (!id || !name || lists.some((list) => list.id === id)) continue;
        const items: WatchItem[] = [];
        for (const item of Array.isArray(rawList.items) ? rawList.items : []) {
            if (!item || typeof item !== "object" || items.length >= MAX_ITEMS) continue;
            const rawItem = item as Record<string, unknown>;
            if (!isListSymbol(rawItem.symbol) || items.some((other) => other.symbol === rawItem.symbol)) continue;
            const addedAt = typeof rawItem.addedAt === "number" && Number.isFinite(rawItem.addedAt) ? rawItem.addedAt : 0;
            items.push({ symbol: rawItem.symbol, company: cleanCompany(rawItem.company, rawItem.symbol), addedAt });
        }
        lists.push({ id, name, items });
    }
    if (lists.length === 0) return undefined;
    const activeId = lists.some((list) => list.id === raw.activeId) ? (raw.activeId as string) : lists[0].id;
    return { version: 1, activeId, lists, prefs: parsePrefs(raw.prefs) };
};
