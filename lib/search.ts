// Helpers shared by the stock search window and the Market Data page's search box

// Lets a ticker like BRK.B be typed as "brk b" or "brkb"
export const normalizeSymbol = (value: string) => value.toLowerCase().replace(/[\s.-]/g, "");

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Scores how well a stock matches the search (lower is better), or -1 when it doesn't match.
// Names and industries match from the start of a word, so "nv" finds Nvidia but not Invesco.
export const createMatcher = (query: string) => {
    const typedSymbol = normalizeSymbol(query);
    const typedName = query.toLowerCase();
    const wordStart = new RegExp(`\\b${escapeRegExp(query)}`, "i");

    return (stock: { symbol: string; name: string; industry?: string }) => {
        const symbol = normalizeSymbol(stock.symbol);

        if (typedSymbol && symbol === typedSymbol) return 0;
        if (typedSymbol && symbol.startsWith(typedSymbol)) return 1;
        if (stock.name.toLowerCase().startsWith(typedName)) return 2;
        if (wordStart.test(stock.name)) return 3;
        if (stock.industry && wordStart.test(stock.industry)) return 4;
        return -1;
    };
};

// Where the search text appears in a name, preferring the start of a word, or null when it doesn't
export const findMatch = (text: string, query: string): { start: number; end: number } | null => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const match = new RegExp(`\\b${escapeRegExp(trimmed)}`, "i").exec(text) ?? new RegExp(escapeRegExp(trimmed), "i").exec(text);
    return match ? { start: match.index, end: match.index + match[0].length } : null;
};

export type SecurityKind = "stock" | "etf" | "adr" | "other";

export type SecurityType = {
    kind: SecurityKind;
    // Short code shown on each search result, like a trading platform's STK or ETF
    badge: string;
    label: string;
};

// Finnhub's names for kinds of security (in lower case), and how the search shows them
const SECURITY_TYPES: Record<string, SecurityType> = {
    "common stock": { kind: "stock", badge: "STK", label: "Common stock" },
    "ny reg shrs": { kind: "stock", badge: "STK", label: "New York registered shares" },
    "tracking stk": { kind: "stock", badge: "STK", label: "Tracking stock" },
    "reit": { kind: "stock", badge: "REIT", label: "Real estate investment trust" },
    "etp": { kind: "etf", badge: "ETF", label: "Exchange-traded fund" },
    "etf": { kind: "etf", badge: "ETF", label: "Exchange-traded fund" },
    "etn": { kind: "etf", badge: "ETN", label: "Exchange-traded note" },
    "adr": { kind: "adr", badge: "ADR", label: "American depositary receipt" },
    "gdr": { kind: "adr", badge: "GDR", label: "Global depositary receipt" },
    "closed-end fund": { kind: "other", badge: "FUND", label: "Closed-end fund" },
    "open-end fund": { kind: "other", badge: "FUND", label: "Open-end fund" },
    "mutual fund": { kind: "other", badge: "FUND", label: "Mutual fund" },
    "unit": { kind: "other", badge: "UNIT", label: "Unit" },
    "preference": { kind: "other", badge: "PFD", label: "Preferred stock" },
    "warrant": { kind: "other", badge: "WRT", label: "Warrant" },
    "equity wrt": { kind: "other", badge: "WRT", label: "Warrant" },
    "right": { kind: "other", badge: "RT", label: "Right" },
    "ltd part": { kind: "other", badge: "LP", label: "Limited partnership" },
    "mlp": { kind: "other", badge: "MLP", label: "Master limited partnership" },
};

export const describeSecurityType = (type?: string): SecurityType =>
    SECURITY_TYPES[type?.trim().toLowerCase() ?? ""] ?? { kind: "other", badge: "OTH", label: type?.trim() || "Other" };

// The filters above the search results, in order
export const SECURITY_FILTERS: { value: SecurityKind | "all"; label: string; plural: string }[] = [
    { value: "all", label: "All", plural: "results" },
    { value: "stock", label: "Stocks", plural: "stocks" },
    { value: "etf", label: "ETFs", plural: "ETFs" },
    { value: "adr", label: "ADRs", plural: "ADRs" },
    { value: "other", label: "Other", plural: "other securities" },
];
