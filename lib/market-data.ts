// The rules for every market figure the heatmaps show: how a Finnhub quote becomes the numbers on screen,
// which trading session the US market is in, and when a price counts as stale. There are no server or browser
// APIs here, so the server, the browser and the unit tests all apply exactly the same rules.

import type { MarketSector } from "@/lib/data/sp500";

export type MarketSession = "pre-market" | "regular" | "post-market" | "closed";

// The periods the interactive heatmap can color by besides the 1-day change: from Finnhub's daily stats
// (lib/period-change.ts), and 1H, 4H and 1M from Alpaca (lib/alpaca.ts)
export type HistoryPeriod = "1h" | "4h" | "1w" | "1m" | "mtd" | "3m" | "6m" | "ytd" | "1y";

// Whether Alpaca's figures (1H, 4H, 1M, extended hours, today's volume) are available
export type AlpacaStatus = "ok" | "not-configured" | "auth" | "failed";

// One extended session's latest price for a stock, and the regular close its move is measured from
export type ExtendedPrice = {
    // The latest price in that session, and its time; none yet when the stock hasn't traded in it
    price?: number;
    time?: number;
    reference: number;
    // True while the session is on (prices are live); false for the last finished session
    live: boolean;
    // The New York day the session belongs to
    day: string;
};

// One stock's latest price and the day's figures around it
export type Quote = {
    price: number;
    // The previous regular session's closing price
    previousClose?: number;
    // price − previousClose, and the same as a percentage of previousClose
    change?: number;
    changePercent?: number;
    open?: number;
    dayHigh?: number;
    dayLow?: number;
    // The provider's timestamp for the price, in milliseconds. Finnhub sends it as `t` (seconds). It isn't in
    // Finnhub's published schema; in practice it is the last update during the session and 4:00 PM ET after the close.
    time?: number;
};

// A company on the interactive heatmaps, with whatever the provider had for it. Missing figures stay undefined, never 0.
export type HeatmapStock = {
    symbol: string;
    name: string;
    // GICS sector and sub-industry, from the bundled S&P 500 list
    sector: MarketSector;
    industry: string;
    exchange?: string;
    logo?: string;
    // Company market cap in US dollar millions, from Finnhub's company profile (refreshed daily)
    marketCap?: number;
    quote?: Quote;
    // When we received the quote from Finnhub (its response's Date header), in milliseconds
    fetchedAt?: number;
    // The price each longer period started at (1 week ago, the start of the year, ...), from Finnhub's daily stats
    // (lib/period-change.ts). The live price against these gives the longer periods' changes.
    periodStart?: Partial<Record<HistoryPeriod, number>>;
    // Average daily volume over the last 10 trading days, in shares, from the same stats
    averageVolume?: number;
    // The last trading day's volume so far (up to 15 minutes ago), from Alpaca
    todayVolume?: { shares: number; dollars?: number; day: string; through: number };
    // Pre-market and after-hours prices, from Alpaca and Finnhub's trade stream
    extended?: Partial<Record<"pre-market" | "post-market", ExtendedPrice>>;
};

// What went wrong when some figures couldn't be fetched, worst first. "busy" means our own request budget for the
// provider was used up, so the request is still waiting its turn (it fills the cache for the next refresh);
// "rate-limit" means the provider itself refused with 429.
export type FeedIssue = "not-configured" | "auth" | "rate-limit" | "busy" | "provider" | "network";

// Everything the server sends for the interactive heatmaps
export type HeatmapPayload = {
    provider: "Finnhub";
    // Every stock in the universe, in its listed order, priced or not
    stocks: HeatmapStock[];
    // When the server put this answer together, in milliseconds
    generatedAt: number;
    // Requests that failed while putting it together, and the main reason
    failedRequests: number;
    issue?: FeedIssue;
    alpaca?: AlpacaStatus;
};

const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const positive = (value: unknown) => {
    const number = finite(value);
    return number !== undefined && number > 0 ? number : undefined;
};

// A provider clock a little ahead of ours is fine; one far ahead means the timestamp can't be trusted
const FUTURE_TOLERANCE_MS = 5 * 60_000;

// Turns a raw Finnhub /quote answer into a Quote, or undefined when there's no usable price.
// Finnhub answers an unknown symbol with zeros, so a price of 0 means "no quote", never a price of $0.
// The change is worked out from the price and the previous close, so the dollar and percent figures always agree;
// Finnhub's own d and dp are only used when the previous close is missing.
export function normalizeQuote(raw: unknown, now = Date.now()): Quote | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const q = raw as Record<string, unknown>;
    const price = positive(q.c);
    if (price === undefined) return undefined;

    const previousClose = positive(q.pc);
    const change = previousClose !== undefined ? price - previousClose : finite(q.d);
    const changePercent = previousClose !== undefined ? ((price - previousClose) / previousClose) * 100 : finite(q.dp);

    // Seconds, as Finnhub sends it, but accept milliseconds too
    const t = positive(q.t);
    const ms = t === undefined ? undefined : t < 1e11 ? t * 1000 : t;
    const time = ms !== undefined && ms <= now + FUTURE_TOLERANCE_MS ? ms : undefined;

    let dayHigh = positive(q.h);
    let dayLow = positive(q.l);
    // A high below the low is a broken answer, so show neither
    if (dayHigh !== undefined && dayLow !== undefined && dayHigh < dayLow) dayHigh = dayLow = undefined;

    return { price, previousClose, change, changePercent, open: positive(q.o), dayHigh, dayLow, time };
}

// ---------- Which listing an answer is for ----------
//
// Finnhub can answer one share class with another class's profile: BRK.B gets BRK.A's (checked with real data on
// 2026-10-11). Company-wide figures (name, logo, exchange, total market cap) are the same for every class; per-share
// figures (EPS, 52-week range, shares outstanding) are not.

const canonicalTicker = (ticker: string) => ticker.trim().toUpperCase().replace(/[-/]/g, ".");

// The same listing, however the class is written: BRK.B, BRK-B and BRK/B
export const sameListing = (a: string, b: string) => canonicalTicker(a) === canonicalTicker(b);

// The same company, possibly another share class: BRK.A and BRK.B. GOOG and GOOGL have no class suffix in their
// tickers, so they never match each other here (Finnhub answers each with its own profile).
export const sameCompany = (a: string, b: string) => canonicalTicker(a).split(".")[0] === canonicalTicker(b).split(".")[0];

// ---------- The New York clock ----------

const NEW_YORK = "America/New_York";
const NY_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
});

// The weekday, the calendar day ("2026-10-09") and the minutes since midnight in New York
export const newYorkClock = (ms: number) => {
    const parts = NY_PARTS.formatToParts(ms);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return {
        weekday: part("weekday"),
        day: `${part("year")}-${part("month")}-${part("day")}`,
        minutes: Number(part("hour")) * 60 + Number(part("minute")),
    };
};

// The US trading session from the New York clock: pre-market from 4:00, open 9:30, close 16:00, after hours until 20:00.
// Only a fallback for when Finnhub's market status can't load, since it doesn't know about holidays or early closes.
export const sessionFromClock = (ms: number): MarketSession => {
    const { weekday, minutes } = newYorkClock(ms);
    if (weekday === "Sat" || weekday === "Sun") return "closed";
    if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre-market";
    if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular";
    if (minutes >= 16 * 60 && minutes < 20 * 60) return "post-market";
    return "closed";
};

const NY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: NEW_YORK, hour: "numeric", minute: "2-digit" });
const NY_DAY = new Intl.DateTimeFormat("en-US", { timeZone: NEW_YORK, weekday: "short", month: "short", day: "numeric" });

// "4:00 PM"
export const formatNewYorkTime = (ms: number) => NY_TIME.format(ms);
// "Fri, Oct 9"
export const formatNewYorkDay = (ms: number) => NY_DAY.format(ms);
// "4:00 PM ET" on the same New York day as `now`, otherwise "Fri, Oct 9, 4:00 PM ET"
export const formatNewYorkMoment = (ms: number, now: number) =>
    newYorkClock(ms).day === newYorkClock(now).day ? `${formatNewYorkTime(ms)} ET` : `${formatNewYorkDay(ms)}, ${formatNewYorkTime(ms)} ET`;

// ---------- What the 1-day change covers right now ----------

export type DailyPeriod = {
    // "Today" or "Last session"
    label: string;
    // The session's day, like "Fri, Oct 9", when it isn't today
    day?: string;
    // True only while the regular session is trading
    live: boolean;
};

// Names the session a 1-day change belongs to. During the session it's today's move. Before the open, overnight,
// on weekends and on holidays the prices are the last session's, so the label says so with that session's day.
// Prices from an earlier day are the last session's even once the market opens, until today's arrive.
export function describeDailyPeriod(session: MarketSession, newestQuoteTime: number | undefined, now: number): DailyPeriod {
    const fromToday = newestQuoteTime !== undefined && newYorkClock(newestQuoteTime).day === newYorkClock(now).day;
    if (session === "regular" && (fromToday || newestQuoteTime === undefined)) return { label: "Today", live: true };
    if (fromToday) return { label: "Today", live: false };
    return { label: "Last session", day: newestQuoteTime !== undefined ? formatNewYorkDay(newestQuoteTime) : undefined, live: false };
}

// How a screen reader says when a 1-day change happened: "today", or "in the last session, Fri, Oct 9"
export const periodPhrase = (period: DailyPeriod) =>
    period.label === "Today" ? "today" : `in the last session${period.day ? `, ${period.day}` : ""}`;

// The same for one stock, from its own price time, so a stock that hasn't refreshed isn't described with the
// map's period: "today", or "on Fri, Oct 9". Without a price time it falls back to the map's phrase.
export const quotePeriodPhrase = (time: number | undefined, now: number, mapPhrase: string) => {
    if (time === undefined) return mapPhrase;
    return newYorkClock(time).day === newYorkClock(now).day ? "today" : `on ${formatNewYorkDay(time)}`;
};

// ---------- Freshness ----------

export type Freshness = "fresh" | "stale" | "missing";

// During the regular session a price older than this is stale. Prices are cached on the server for up to
// 3¼ minutes and the page asks every minute, so a working feed stays well inside it.
export const STALE_IN_SESSION_MS = 15 * 60_000;
// In any session, a price this far behind the newest price on the map didn't refresh with the others
export const BEHIND_OTHERS_MS = 30 * 60_000;
// Outside the session, the last session's prices are expected, but not ones older than a long weekend
export const STALE_WHEN_CLOSED_MS = 4 * 24 * 60 * 60_000;

// Whether a stock's price can be shown as current, given the session and the newest price on the map
export function quoteFreshness(quote: Quote | undefined, context: { now: number; session: MarketSession; newestQuoteTime?: number }): Freshness {
    if (!quote) return "missing";
    // A price with no time can't be shown as current
    if (quote.time === undefined) return "stale";
    const { now, session, newestQuoteTime } = context;
    if (session === "regular" && now - quote.time > STALE_IN_SESSION_MS) return "stale";
    if (newestQuoteTime !== undefined && newestQuoteTime - quote.time > BEHIND_OTHERS_MS) return "stale";
    if (session !== "regular" && now - quote.time > STALE_WHEN_CLOSED_MS) return "stale";
    return "fresh";
}

// The newest provider timestamp among the stocks' quotes
export const newestQuoteTime = (stocks: readonly HeatmapStock[]) =>
    stocks.reduce<number | undefined>((newest, { quote }) => (quote?.time !== undefined && quote.time > (newest ?? 0) ? quote.time : newest), undefined);

// ---------- Sector aggregates ----------

// The market-cap-weighted 1-day change of a group of stocks: Σ(cap × change%) ÷ Σ cap, over the stocks that have
// both figures. This is the stocks' own combined move, which differs from a sector ETF's move (see lib/data/markets.ts).
// Given each stock's freshness, it counts only current prices, so one figure never mixes two sessions' moves;
// `stale` says how many priced stocks were left out for that.
export function capWeightedChange(stocks: readonly HeatmapStock[], freshness?: ReadonlyMap<string, Freshness>) {
    let weighted = 0;
    let caps = 0;
    let counted = 0;
    let stale = 0;
    for (const { symbol, marketCap, quote } of stocks) {
        if (!marketCap || quote?.changePercent === undefined) continue;
        if (freshness && freshness.get(symbol) !== "fresh") {
            stale++;
            continue;
        }
        weighted += marketCap * quote.changePercent;
        caps += marketCap;
        counted++;
    }
    return { changePercent: caps > 0 ? weighted / caps : undefined, counted, stale, total: stocks.length };
}

// ---------- A whole map at once ----------

export type FeedAssessment = {
    freshness: Map<string, Freshness>;
    newestQuoteTime?: number;
    period: DailyPeriod;
    priced: number;
    stale: number;
    missing: number;
};

// Each stock's freshness plus the counts and period label the map's status line shows
export function assessStocks(stocks: readonly HeatmapStock[], context: { now: number; session: MarketSession }): FeedAssessment {
    const newest = newestQuoteTime(stocks);
    const freshness = new Map<string, Freshness>();
    let stale = 0;
    let missing = 0;
    for (const stock of stocks) {
        const status = quoteFreshness(stock.quote, { ...context, newestQuoteTime: newest });
        freshness.set(stock.symbol, status);
        if (status === "stale") stale++;
        else if (status === "missing") missing++;
    }
    return {
        freshness,
        newestQuoteTime: newest,
        period: describeDailyPeriod(context.session, newest, context.now),
        priced: stocks.length - missing,
        stale,
        missing,
    };
}
