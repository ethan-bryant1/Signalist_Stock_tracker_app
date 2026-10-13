// How each watchlist column shows its figure: fixed decimals, currency signs, and a dash for a missing figure or
// "n/a" for one that doesn't apply (a fund's P/E). Pure, so it's unit tested; the grid only adds colors.

import { COLUMNS, columnApplies, type ColumnKey, type WatchRow } from "@/lib/watchlists";
import { formatChangePercent, formatCurrency, formatMarketCapValue, formatSignedNumber } from "@/lib/utils";

export type Cell = {
    text: string;
    // "missing": no figure from the provider; "na": the figure doesn't exist for this kind of instrument;
    // "unloaded": the request for it failed or waited for the call budget, so it may exist
    state?: "missing" | "na" | "unloaded";
    // Signed figures are colored by the day's change
    signed?: boolean;
};

export const MISSING = "—";

// Millions of shares, as Finnhub sends average volume, to "12.35M", "1.20B" or "850.00K"
export const formatVolume = (millions: number) => {
    if (millions >= 1000) return `${(millions / 1000).toFixed(2)}B`;
    if (millions >= 1) return `${millions.toFixed(2)}M`;
    return `${(millions * 1000).toFixed(2)}K`;
};

const money = (row: WatchRow, value?: number) => (value === undefined ? undefined : formatCurrency(value, row.currency));

export const cellFor = (key: ColumnKey, row: WatchRow): Cell => {
    if (!columnApplies(key, row.kind)) return { text: "n/a", state: "na" };
    const value = COLUMNS[key].value(row);
    if (value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) return { text: MISSING, state: COLUMNS[key].fromMetrics && row.figuresIssue ? "unloaded" : "missing" };
    switch (key) {
        case "name":
        case "industry":
        case "exchange":
            return { text: String(value) };
        case "change":
            return { text: formatSignedNumber(row.change!), signed: true };
        case "changePercent":
            return { text: formatChangePercent(row.changePercent), signed: true };
        case "marketCap":
            return { text: formatMarketCapValue(row.marketCap!) };
        case "peRatio":
            return { text: row.peRatio!.toFixed(2) };
        case "dividendYield":
            return { text: `${row.dividendYield!.toFixed(2)}%` };
        case "avgVolume":
            return { text: formatVolume(row.avgVolume!) };
        case "time":
            // The grid shows the price's stamp component here; this text is for sorting checks and screen readers
            return { text: String(value) };
        default:
            return { text: money(row, value as number) ?? MISSING };
    }
};

// Where the price sits in a low-high range, 0 to 1, or undefined when the range or price is missing
export const rangePosition = (value?: number, low?: number, high?: number) => {
    if (value === undefined || low === undefined || high === undefined || high <= low) return undefined;
    return Math.min(1, Math.max(0, (value - low) / (high - low)));
};
