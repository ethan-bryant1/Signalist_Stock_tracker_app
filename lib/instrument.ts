// What kind of instrument a symbol is, so its page shows the figures that apply to it. Pure: no server or browser APIs.
//
// Finnhub's free plan has a company profile for operating companies (name, exchange, industry, shares) and answers {}
// for funds like SPY. A symbol with a profile is a company; one without is a fund when it's one we know, and
// "other" when we can't tell (an ETF we don't list, a closed-end fund, a warrant, a typo with a price).

export type InstrumentKind = "stock" | "fund" | "other";

// Exchange-traded funds the app shows or that people commonly look up, with the exchange TradingView lists them on
// (TradingView names NYSE Arca "AMEX"). Names are the funds' own; nothing here is a price or a figure.
export const KNOWN_FUNDS: Record<string, { name: string; tradingViewExchange: "AMEX" | "NASDAQ" | "CBOE" }> = {
    SPY: { name: "SPDR S&P 500 ETF Trust", tradingViewExchange: "AMEX" },
    QQQ: { name: "Invesco QQQ Trust", tradingViewExchange: "NASDAQ" },
    DIA: { name: "SPDR Dow Jones Industrial Average ETF Trust", tradingViewExchange: "AMEX" },
    IWM: { name: "iShares Russell 2000 ETF", tradingViewExchange: "AMEX" },
    GLD: { name: "SPDR Gold Shares", tradingViewExchange: "AMEX" },
    USO: { name: "United States Oil Fund", tradingViewExchange: "AMEX" },
    TLT: { name: "iShares 20+ Year Treasury Bond ETF", tradingViewExchange: "NASDAQ" },
    XLK: { name: "Technology Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLF: { name: "Financial Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLV: { name: "Health Care Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLY: { name: "Consumer Discretionary Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLC: { name: "Communication Services Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLI: { name: "Industrial Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLP: { name: "Consumer Staples Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLE: { name: "Energy Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLU: { name: "Utilities Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLRE: { name: "Real Estate Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    XLB: { name: "Materials Select Sector SPDR Fund", tradingViewExchange: "AMEX" },
    VOO: { name: "Vanguard S&P 500 ETF", tradingViewExchange: "AMEX" },
    VTI: { name: "Vanguard Total Stock Market ETF", tradingViewExchange: "AMEX" },
    IVV: { name: "iShares Core S&P 500 ETF", tradingViewExchange: "AMEX" },
};

export const instrumentKind = (symbol: string, hasCompanyProfile: boolean): InstrumentKind =>
    hasCompanyProfile ? "stock" : symbol.toUpperCase() in KNOWN_FUNDS ? "fund" : "other";

export type KeyStat = "previousClose" | "open" | "dayRange" | "week52Range" | "marketCap" | "peRatio" | "eps" | "dividendYield";

// The figures each kind's page lists. A fund has no earnings, so P/E and EPS don't apply; Finnhub's free plan has
// no fund assets or expense ratio, so a fund shows its price figures only. "Other" shows what any listing has.
export const KEY_STATS: Record<InstrumentKind, KeyStat[]> = {
    stock: ["previousClose", "open", "dayRange", "week52Range", "marketCap", "peRatio", "eps", "dividendYield"],
    fund: ["previousClose", "open", "dayRange", "week52Range"],
    other: ["previousClose", "open", "dayRange", "week52Range"],
};

export const KIND_LABEL: Record<InstrumentKind, string> = {
    stock: "Stock",
    fund: "ETF",
    other: "Listing",
};
