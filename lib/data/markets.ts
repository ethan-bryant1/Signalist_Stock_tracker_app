import type { MarketSector } from "@/lib/data/sp500";

// ETFs that track the major US indexes. Finnhub's free plan has live ETF prices but not index levels.
export const INDEX_ETFS = [
    { symbol: "SPY", label: "S&P 500" },
    { symbol: "QQQ", label: "Nasdaq 100" },
    { symbol: "DIA", label: "Dow 30" },
    { symbol: "IWM", label: "Russell 2000" },
] as const;

// The SPDR fund that tracks each S&P 500 sector, so a sector's move is its fund's move
export const SECTOR_ETFS: { sector: MarketSector; label: string; symbol: string }[] = [
    { sector: "Information Technology", label: "Technology", symbol: "XLK" },
    { sector: "Financials", label: "Financials", symbol: "XLF" },
    { sector: "Health Care", label: "Health Care", symbol: "XLV" },
    { sector: "Consumer Discretionary", label: "Consumer Discretionary", symbol: "XLY" },
    { sector: "Communication Services", label: "Communication", symbol: "XLC" },
    { sector: "Industrials", label: "Industrials", symbol: "XLI" },
    { sector: "Consumer Staples", label: "Consumer Staples", symbol: "XLP" },
    { sector: "Energy", label: "Energy", symbol: "XLE" },
    { sector: "Utilities", label: "Utilities", symbol: "XLU" },
    { sector: "Real Estate", label: "Real Estate", symbol: "XLRE" },
    { sector: "Materials", label: "Materials", symbol: "XLB" },
];
