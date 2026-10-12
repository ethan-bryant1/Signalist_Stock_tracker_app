import type { MarketSector } from "@/lib/data/sp500";

// ETFs that track the major US indexes. Finnhub's free plan has live ETF prices but not index levels.
export const INDEX_ETFS = [
    { symbol: "SPY", label: "S&P 500" },
    { symbol: "QQQ", label: "Nasdaq 100" },
    { symbol: "DIA", label: "Dow 30" },
    { symbol: "IWM", label: "Russell 2000" },
] as const;

// Funds that follow gold, oil and long-term US government bonds, shown after the indexes in the header
export const MACRO_ETFS = [
    { symbol: "GLD", label: "Gold" },
    { symbol: "USO", label: "Crude oil" },
    { symbol: "TLT", label: "Treasuries" },
] as const;

// The 11 GICS sectors of the S&P 500, each with the SPDR Select Sector ETF that holds that sector's stocks.
// An ETF's move is not the same as its sector's stocks' combined move: S&P caps the biggest holdings in each
// Select Sector index (no company above roughly 23%), so the ETF weights its stocks differently.
// `short` is the heading used when the full name doesn't fit.
export const SECTOR_ETFS: { sector: MarketSector; short: string; symbol: string }[] = [
    { sector: "Information Technology", short: "Info Tech", symbol: "XLK" },
    { sector: "Financials", short: "Financials", symbol: "XLF" },
    { sector: "Health Care", short: "Health Care", symbol: "XLV" },
    { sector: "Consumer Discretionary", short: "Cons. Discretionary", symbol: "XLY" },
    { sector: "Communication Services", short: "Comm. Services", symbol: "XLC" },
    { sector: "Industrials", short: "Industrials", symbol: "XLI" },
    { sector: "Consumer Staples", short: "Cons. Staples", symbol: "XLP" },
    { sector: "Energy", short: "Energy", symbol: "XLE" },
    { sector: "Utilities", short: "Utilities", symbol: "XLU" },
    { sector: "Real Estate", short: "Real Estate", symbol: "XLRE" },
    { sector: "Materials", short: "Materials", symbol: "XLB" },
];

export const SECTOR_BY_NAME = new Map(SECTOR_ETFS.map((entry) => [entry.sector as string, entry]));
