// Live prices from Finnhub's trade stream, and how they update the interactive heatmaps. No server or browser APIs
// here, so the stream route, the page and the unit tests apply the same rules.

import { sessionFromClock, type HeatmapStock, type Quote } from "@/lib/market-data";

// Finnhub's free plan streams trades for up to 50 symbols at a time
export const STREAM_SYMBOL_LIMIT = 50;

// The newest trade the page has heard of for one stock
export type LiveTrade = { symbol: string; price: number; time: number };

// The stocks to stream: the largest by market cap, up to the limit, so the tiles that fill most of the map move
// live. The rest keep updating once a minute. Stocks without a market cap come last, in their listed order.
export const pickStreamSymbols = (stocks: readonly Pick<HeatmapStock, "symbol" | "marketCap">[], limit = STREAM_SYMBOL_LIMIT): string[] =>
    stocks
        .map((stock, index) => ({ stock, index }))
        .sort((a, b) => (b.stock.marketCap ?? -1) - (a.stock.marketCap ?? -1) || a.index - b.index)
        .slice(0, limit)
        .map(({ stock }) => stock.symbol);

// Finnhub's trade message: {"type":"trade","data":[{"s":"AAPL","p":227.5,"t":1760025600000,"v":100,"c":["1"]}]}.
// Returns the newest usable trade per symbol, for the symbols asked for. Only trades in the regular session count:
// the map shows the 1-day change from the previous close, which Finnhub's quote also gives for regular hours only,
// so a pre-market or after-hours trade would mix two different moves on one tile.
export function latestTrades(message: unknown, symbols: ReadonlySet<string>): LiveTrade[] {
    if (!message || typeof message !== "object") return [];
    const { type, data } = message as { type?: unknown; data?: unknown };
    if (type !== "trade" || !Array.isArray(data)) return [];

    const newest = new Map<string, LiveTrade>();
    for (const raw of data) {
        if (!raw || typeof raw !== "object") continue;
        const { s, p, t } = raw as { s?: unknown; p?: unknown; t?: unknown };
        if (typeof s !== "string" || !symbols.has(s)) continue;
        if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) continue;
        if (typeof t !== "number" || !Number.isFinite(t) || sessionFromClock(t) !== "regular") continue;
        const seen = newest.get(s);
        if (!seen || t >= seen.time) newest.set(s, { symbol: s, price: p, time: t });
    }
    return [...newest.values()];
}

// A quote moved to a newer trade price. The change is worked out from the previous close as normalizeQuote does,
// and the day's range widens to include the trade.
const quoteWithTrade = (quote: Quote, trade: LiveTrade): Quote => {
    const { previousClose } = quote;
    return {
        ...quote,
        price: trade.price,
        change: previousClose !== undefined ? trade.price - previousClose : quote.change,
        changePercent: previousClose !== undefined ? ((trade.price - previousClose) / previousClose) * 100 : quote.changePercent,
        dayHigh: quote.dayHigh !== undefined ? Math.max(quote.dayHigh, trade.price) : undefined,
        dayLow: quote.dayLow !== undefined ? Math.min(quote.dayLow, trade.price) : undefined,
        time: trade.time,
    };
};

// Applies live trades to the map's stocks, received by the page at `receivedAt`. A trade only replaces a quote it is newer than, and only one from the
// same New York day (a trade can't carry today's move onto yesterday's previous close). Stocks without a quote yet
// wait for the next refresh, which brings the previous close the change needs. Unchanged stocks keep the same
// object, and when nothing changed the same list comes back, so tiles don't redraw.
export function applyLiveTrades(stocks: HeatmapStock[], trades: readonly LiveTrade[], receivedAt: number): HeatmapStock[] {
    if (!trades.length) return stocks;
    const bySymbol = new Map(trades.map((trade) => [trade.symbol, trade]));
    let changed = false;
    const next = stocks.map((stock) => {
        const trade = bySymbol.get(stock.symbol);
        const quote = stock.quote;
        if (!trade || !quote || quote.time === undefined || trade.time <= quote.time) return stock;
        if (!sameNewYorkDay(trade.time, quote.time)) return stock;
        if (trade.price === quote.price) {
            changed = true;
            return { ...stock, quote: { ...quote, time: trade.time }, fetchedAt: receivedAt };
        }
        changed = true;
        return { ...stock, quote: quoteWithTrade(quote, trade), fetchedAt: receivedAt };
    });
    return changed ? next : stocks;
}

const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const sameNewYorkDay = (a: number, b: number) => NY_DAY.format(a) === NY_DAY.format(b);

// Of the quote on the page (a) and a refreshed one (b), the one to show: the newer by its price time, the refreshed
// one on a tie. A refresh can bring an answer cached on the server a minute or two ago, which mustn't undo the
// live trades since.
export const newerQuote = (a: Quote | undefined, b: Quote | undefined): Quote | undefined => {
    if (!a) return b;
    if (!b) return a;
    return (b.time ?? 0) >= (a.time ?? 0) ? b : a;
};
