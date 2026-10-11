// The stocks on the dashboard heatmap: the biggest S&P 500 companies in each of the 11 sectors.
// Finnhub's free plan sends one price per request and allows 60 requests a minute, so the map can't
// show all 500 companies live; the Heatmap page's TradingView map shows the whole index.
// Picked on 2026-10-11. Tiles are sized by each company's live market cap, so the order here doesn't matter,
// but swap names in when a company grows into, or drops out of, the top of its sector.
// Every symbol must also be in lib/data/sp500.ts, which gives its sector and industry.
export const HEATMAP_SYMBOLS = [
    // Information Technology
    "NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "AMD", "PLTR", "MU",
    // Communication Services
    "GOOGL", "META", "NFLX", "TMUS", "DIS",
    // Consumer Discretionary
    "AMZN", "TSLA", "HD", "MCD", "BKNG",
    // Financials
    "BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS",
    // Health Care
    "LLY", "JNJ", "ABBV", "UNH", "MRK", "ABT",
    // Industrials
    "GE", "CAT", "RTX", "GEV", "UBER",
    // Consumer Staples
    "WMT", "COST", "PG", "KO", "PM",
    // Energy
    "XOM", "CVX", "COP",
    // Utilities
    "NEE", "SO", "CEG",
    // Real Estate
    "PLD", "WELL", "AMT",
    // Materials
    "LIN", "NEM", "SHW",
] as const;
