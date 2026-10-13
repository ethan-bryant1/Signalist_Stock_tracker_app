// Longer periods and volume for the interactive heatmap, from Finnhub's free company stats (/stock/metric).
// No server or browser APIs here, so the server, the page and the unit tests apply the same rules.
//
// Finnhub's free plan has no price history, but its stats include each stock's price return over several periods,
// worked out from daily closes. From a return and the close it was measured to, we get the price the period started
// at, and the live price is then compared with that. So a 1-week tile moves with every trade, just like a 1-day one.

import { newYorkClock, type HeatmapStock, type HistoryPeriod, type Quote } from "@/lib/market-data";

export type { HistoryPeriod };

// Finnhub's name for each return (percent, through the last daily close). "1w" is five trading days, "3m" 13 weeks,
// "6m" 26 weeks and "1y" 52 weeks. Finnhub has no 1-month return, only month to date.
export const FINNHUB_RETURN_FIELDS: Partial<Record<HistoryPeriod, string>> = {
    "1w": "5DayPriceReturnDaily",
    mtd: "monthToDatePriceReturnDaily",
    "3m": "13WeekPriceReturnDaily",
    "6m": "26WeekPriceReturnDaily",
    ytd: "yearToDatePriceReturnDaily",
    "1y": "52WeekPriceReturnDaily",
};

// Average daily share volume over the last 10 trading days, in millions of shares
export const FINNHUB_AVERAGE_VOLUME_FIELD = "10DayAverageTradingVolume";

// Returns beyond these can't be real for an S&P 500 stock over these periods, so they're treated as bad data
const MIN_RETURN = -99;
const MAX_RETURN = 10_000;

export type StockStats = {
    // Price return over each period through the last daily close, in percent
    returns: Partial<Record<HistoryPeriod, number>>;
    // Average daily volume over 10 days, in shares
    averageVolume?: number;
};

// Reads the figures we use out of Finnhub's /stock/metric?metric=all answer. Anything missing or broken is left out.
export function parseFinnhubStats(raw: unknown): StockStats {
    const metric = raw && typeof raw === "object" ? (raw as { metric?: unknown }).metric : undefined;
    const fields = metric && typeof metric === "object" ? (metric as Record<string, unknown>) : {};
    const returns: StockStats["returns"] = {};
    for (const [period, field] of Object.entries(FINNHUB_RETURN_FIELDS) as [HistoryPeriod, string][]) {
        const value = fields[field];
        if (typeof value === "number" && Number.isFinite(value) && value > MIN_RETURN && value < MAX_RETURN) returns[period] = value;
    }
    const volume = fields[FINNHUB_AVERAGE_VOLUME_FIELD];
    const averageVolume = typeof volume === "number" && Number.isFinite(volume) && volume > 0 ? volume * 1_000_000 : undefined;
    return { returns, averageVolume };
}

// The daily close Finnhub's returns are measured to: the last session that finished before today. While today's
// session is on (or just ended) that's the quote's previous close; when the quote is from an earlier day (before the
// open, overnight, weekends) it's that day's closing price, which is the quote's price.
// Assumes Finnhub recomputes the stats overnight; between the close and that recompute this is right, and after it
// the stats reload within a day (see STATS_SECONDS in lib/heatmap-data.ts).
export function statsAnchor(quote: Quote | undefined, now: number): number | undefined {
    if (!quote) return undefined;
    const fromToday = quote.time !== undefined && newYorkClock(quote.time).day === newYorkClock(now).day;
    return fromToday ? quote.previousClose : quote.price;
}

// The price each period started at, from the returns and the close they're measured to
export function periodStarts(stats: StockStats, anchor: number | undefined): HeatmapStock["periodStart"] {
    if (anchor === undefined || !(anchor > 0)) return undefined;
    const starts: NonNullable<HeatmapStock["periodStart"]> = {};
    for (const [period, percent] of Object.entries(stats.returns) as [HistoryPeriod, number][]) {
        starts[period] = anchor / (1 + percent / 100);
    }
    return Object.keys(starts).length ? starts : undefined;
}

// What the interactive map can color by besides the 1-day change: a longer period, or an extended-hours session
export type ShiftedColor = HistoryPeriod | "premarket" | "postmarket";
const EXTENDED_SESSION = { premarket: "pre-market", postmarket: "post-market" } as const;

// A stock as the map shows it for a longer period: its change is the live price against the period's starting
// price. For pre-market or after hours, its price is the session's latest and its change is from the regular close
// before it. Without a starting price (or a trade in the session) there's no change to show (the tile reads "—"),
// never the 1-day change instead.
// The same stock object always gives back the same result for a period, so tiles that didn't change don't redraw.
const cache = new WeakMap<HeatmapStock, Partial<Record<ShiftedColor, HeatmapStock>>>();

const withoutChange = (stock: HeatmapStock, quote: Quote): HeatmapStock => ({ ...stock, quote: { ...quote, change: undefined, changePercent: undefined } });

export function withPeriodChange(stock: HeatmapStock, color: ShiftedColor): HeatmapStock {
    const saved = cache.get(stock)?.[color];
    if (saved) return saved;
    const quote = stock.quote;
    let shown: HeatmapStock;
    if (!quote) shown = stock;
    else if (color === "premarket" || color === "postmarket") {
        const session = stock.extended?.[EXTENDED_SESSION[color]];
        shown =
            session?.price === undefined
                ? withoutChange(stock, quote)
                : {
                      ...stock,
                      quote: {
                          ...quote,
                          price: session.price,
                          previousClose: session.reference,
                          change: session.price - session.reference,
                          changePercent: ((session.price - session.reference) / session.reference) * 100,
                          time: session.time ?? quote.time,
                      },
                  };
    } else {
        const start = stock.periodStart?.[color];
        shown = start === undefined ? withoutChange(stock, quote) : { ...stock, quote: { ...quote, change: quote.price - start, changePercent: ((quote.price - start) / start) * 100 } };
    }
    cache.set(stock, { ...cache.get(stock), [color]: shown });
    return shown;
}

// Whether a priced stock has a figure for the color: a period's starting price, or a trade in the extended session
export const hasColorData = (stock: HeatmapStock, color: ShiftedColor) =>
    color === "premarket" || color === "postmarket" ? stock.extended?.[EXTENDED_SESSION[color]]?.price !== undefined : stock.periodStart?.[color] !== undefined;

// The extended session the stocks' prices are for: live now, or the last one that finished (and its day)
export const extendedSessionShown = (stocks: readonly HeatmapStock[], color: "premarket" | "postmarket") => {
    for (const stock of stocks) {
        const session = stock.extended?.[EXTENDED_SESSION[color]];
        if (session) return { live: session.live, day: session.day };
    }
    return undefined;
};

// How many percent gives a tile its full color for each period. Longer periods move further, so a 1-year map
// colored on the 1-day scale would be all full green and red. Each is a multiple of 3, so the legend's marks at
// every third are whole numbers.
export const PERIOD_FULL_COLOR_AT: Record<"1d" | HistoryPeriod | "premarket" | "postmarket", number> = {
    "1h": 1.5,
    "4h": 3,
    "1d": 3,
    "1m": 9,
    premarket: 3,
    postmarket: 3,
    "1w": 6,
    mtd: 9,
    "3m": 15,
    "6m": 21,
    ytd: 24,
    "1y": 30,
};

// The value a stock is sized by on a volume map. With `today`, the last trading day's volume so far (from Alpaca);
// otherwise the 10-day average. Never a mix, so a missing figure leaves the stock off the map rather than sizing it
// on a different basis from the others.
export const volumeSize = (stock: HeatmapStock, dollars: boolean, today = false) => {
    if (today) {
        const volume = stock.todayVolume;
        if (!volume) return undefined;
        if (!dollars) return volume.shares;
        return volume.dollars ?? (stock.quote ? volume.shares * stock.quote.price : undefined);
    }
    if (!stock.averageVolume) return undefined;
    if (!dollars) return stock.averageVolume;
    return stock.quote ? stock.averageVolume * stock.quote.price : undefined;
};
