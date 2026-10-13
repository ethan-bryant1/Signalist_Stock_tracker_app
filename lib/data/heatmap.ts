// The stocks on the dashboard's Market Snapshot map: the largest S&P 500 companies in each of
// the 11 GICS sectors, 3 to 8 per sector. Finnhub's free plan sends one price per request and allows 60 requests
// a minute, so the map can't keep all 500 companies fresh; the S&P 500 Heatmap page (TradingView) shows the whole index.
// Ranked by market cap at the close on 2026-10-09 (TradingView's sector lists, cross-checked with the SPDR sector
// ETFs' top holdings). Re-rank now and then, since companies grow into and out of the top of their sector.
// Every symbol must also be in lib/data/sp500.ts, which gives its sector and industry (a unit test checks this).
export const HEATMAP_UNIVERSE = {
    // How pages describe the set, after its size: "54 of the largest S&P 500 companies in each sector".
    // Not "the 54 largest": a few big companies are left out so every sector has at least three.
    description: "of the largest S&P 500 companies in each sector",
    rankedOn: "2026-10-09",
} as const;

export const HEATMAP_SYMBOLS = [
    // Information Technology
    "NVDA", "AAPL", "MSFT", "AVGO", "MU", "AMD", "INTC", "CSCO",
    // Communication Services
    "GOOGL", "META", "NFLX", "VZ", "TMUS",
    // Consumer Discretionary
    "AMZN", "TSLA", "HD", "MCD", "TJX",
    // Financials (BRK.B is Berkshire Hathaway's class B share; the S&P 500 holds only that class)
    "BRK.B", "JPM", "V", "MA", "BAC", "MS", "GS", "WFC",
    // Health Care
    "LLY", "JNJ", "ABBV", "MRK", "UNH", "TMO",
    // Industrials
    "CAT", "GE", "GEV", "RTX", "DE",
    // Consumer Staples
    "WMT", "COST", "KO", "PG", "PM",
    // Energy
    "XOM", "CVX", "COP",
    // Utilities
    "NEE", "CEG", "SO",
    // Real Estate
    "WELL", "PLD", "EQIX",
    // Materials
    "LIN", "NEM", "FCX",
] as const;
