// What the interactive heatmap takes from Alpaca's free market data, and the rules for it. No server or browser APIs
// here, so the server and the unit tests apply the same rules (the requests themselves are in lib/alpaca.ts).
//
// Alpaca's free plan (checked 2026-10-12, docs.alpaca.markets/docs/about-market-data-api):
// - SIP, every US exchange: any time range that ends at least 15 minutes ago. So it can't give the price now, but it
//   gives exact prices for any moment 15 minutes or more in the past: where the last hour or 4 hours started, a month
//   ago, how a finished pre-market or after-hours session ended, and today's volume up to 15 minutes ago.
// - IEX, one exchange: real time, including its latest trade. Used for extended-hours prices while those sessions
//   are on (Finnhub's quote covers the regular session only).

import { newYorkClock } from "@/lib/market-data";

export type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number; vw?: number };
export type AlpacaTrade = { t: string; p: number; s?: number };

// The free plan can't ask SIP about the last 15 minutes. A minute more keeps clear of clock differences.
export const SIP_DELAY_MS = 16 * 60_000;

const MINUTE = 60_000;

// ---------- New York times as instants ----------

// The instant of a New York wall-clock time: `day` like "2026-10-13" and minutes after midnight. New York is UTC−4 or
// UTC−5, so the one of those that reads back as the asked-for time is right.
export function newYorkInstant(day: string, minutes: number): number {
    const [year, month, date] = day.split("-").map(Number);
    const wall = Date.UTC(year, month - 1, date, 0, minutes);
    for (const offsetHours of [4, 5]) {
        const instant = wall + offsetHours * 60 * MINUTE;
        const clock = newYorkClock(instant);
        if (clock.day === day && clock.minutes === minutes) return instant;
    }
    return wall + 5 * 60 * MINUTE;
}

// The previous calendar day in New York, as "2026-10-12"
export const previousDay = (day: string, days = 1) => {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10);
};

// ---------- Reading answers ----------

const finitePositive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);

// The bars in an answer, per symbol, dropping any without a usable time or close
export function readBars(raw: unknown): Map<string, AlpacaBar[]> {
    const result = new Map<string, AlpacaBar[]>();
    const bars = raw && typeof raw === "object" ? (raw as { bars?: unknown }).bars : undefined;
    if (!bars || typeof bars !== "object") return result;
    for (const [symbol, list] of Object.entries(bars as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        const usable = list.filter(
            (bar): bar is AlpacaBar => !!bar && typeof bar === "object" && typeof bar.t === "string" && Number.isFinite(Date.parse(bar.t)) && !!finitePositive(bar.c)
        );
        if (usable.length) result.set(symbol, usable);
    }
    return result;
}

// The latest trade per symbol in a /trades/latest answer
export function readLatestTrades(raw: unknown): Map<string, { price: number; time: number }> {
    const result = new Map<string, { price: number; time: number }>();
    const trades = raw && typeof raw === "object" ? (raw as { trades?: unknown }).trades : undefined;
    if (!trades || typeof trades !== "object") return result;
    for (const [symbol, trade] of Object.entries(trades as Record<string, unknown>)) {
        if (!trade || typeof trade !== "object") continue;
        const price = finitePositive((trade as AlpacaTrade).p);
        const time = Date.parse(String((trade as AlpacaTrade).t));
        if (price && Number.isFinite(time)) result.set(symbol, { price, time });
    }
    return result;
}

// The close of the last bar that started at or before `time`: the last traded price at that moment
export function closeAt(bars: readonly AlpacaBar[] | undefined, time: number): { price: number; time: number } | undefined {
    let found: AlpacaBar | undefined;
    for (const bar of bars ?? []) {
        const start = Date.parse(bar.t);
        if (start <= time && (!found || start > Date.parse(found.t))) found = bar;
    }
    return found ? { price: found.c, time: Date.parse(found.t) } : undefined;
}

// ---------- Windows to ask for ----------

export type Window = { start: number; end: number };

// Where the 1-hour and 4-hour changes start: the price an hour (or 4 hours) before the map's newest regular-session
// price, so after the close they cover the session's last hour, like a chart's. The window reaches back far enough to
// find a trade for every large stock, and its end is always at least 15 minutes ago.
export const INTRADAY_PERIODS = { "1h": 60, "4h": 240 } as const;
export type IntradayPeriod = keyof typeof INTRADAY_PERIODS;

export function intradayWindow(period: IntradayPeriod, reference: number): Window {
    const at = Math.floor(reference / MINUTE) * MINUTE - INTRADAY_PERIODS[period] * MINUTE;
    return { start: at - (period === "1h" ? 15 : 60) * MINUTE, end: at };
}

// Where the 1-month change starts: the last daily close on or before the same date a month before the last session
export function monthAgoWindow(lastSessionDay: string): { start: string; end: string; target: string } {
    const [year, month, date] = lastSessionDay.split("-").map(Number);
    // Date.UTC rolls an impossible date (Mar 31 → Feb 31) forward, so clamp to the month's last day instead
    const lastOfPrevious = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    const target = new Date(Date.UTC(year, month - 2, Math.min(date, lastOfPrevious))).toISOString().slice(0, 10);
    return { start: previousDay(target, 7), end: target, target };
}

// Pre-market runs 4:00–9:30 AM and after hours 4:00–8:00 PM, New York time
export type ExtendedSession = "pre-market" | "post-market";
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const EXTENDED_HOURS: Record<ExtendedSession, { from: number; to: number }> = {
    "pre-market": { from: 4 * 60, to: OPEN },
    "post-market": { from: CLOSE, to: 20 * 60 },
};

// Which extended session a map shows, and how to price it:
// - live: the session is on now. Prices come from IEX's latest trades (real time) and Finnhub's trade stream.
// - final: the latest finished session. Its last price is the close of the last SIP minute bar in its final hour,
//   exact once it ended 15 minutes ago.
// `reference` is what each stock's change is measured from, as a field of its Finnhub quote: before today's open the
// quote's price is the last close; once today's prices are in, the previous close is in `previousClose`.
export type ExtendedPlan = {
    session: ExtendedSession;
    mode: "live" | "final";
    // The New York day the session belongs to
    day: string;
    window: Window;
    reference: "price" | "previousClose";
};

export const isWeekday = (day: string) => {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return weekday >= 1 && weekday <= 5;
};
const previousWeekday = (day: string) => {
    let previous = previousDay(day);
    while (!isWeekday(previous)) previous = previousDay(previous);
    return previous;
};

// `newestQuoteTime` is the newest regular-session price on the map (Finnhub's quote), which tells the last trading
// day; holidays are known only through it.
export function extendedPlan(session: ExtendedSession, now: number, newestQuoteTime: number | undefined): ExtendedPlan | undefined {
    if (newestQuoteTime === undefined) return undefined;
    const { day: today, minutes } = newYorkClock(now);
    const quoteDay = newYorkClock(newestQuoteTime).day;
    const tradingToday = isWeekday(today) && quoteDay === today;
    const hours = EXTENDED_HOURS[session];
    const whole = (day: string): Window => ({ start: newYorkInstant(day, hours.from), end: newYorkInstant(day, hours.to) });
    const lastHour = (day: string): Window => ({ start: newYorkInstant(day, hours.to - 60), end: newYorkInstant(day, hours.to) });

    if (session === "pre-market") {
        // Before the open on a weekday; a holiday shows no trades, so the map says so rather than guessing
        if (isWeekday(today) && quoteDay < today && minutes >= hours.from && minutes < hours.to) {
            return { session, mode: "live", day: today, window: whole(today), reference: "price" };
        }
        // Today's pre-market once the market opened, or else the last trading day's
        return { session, mode: "final", day: quoteDay, window: lastHour(quoteDay), reference: "previousClose" };
    }
    if (tradingToday && minutes >= hours.from && minutes < hours.to) {
        return { session, mode: "live", day: today, window: whole(today), reference: "price" };
    }
    // During today's regular session the latest after-hours session is the previous trading day's, measured from its
    // close, which today's quote has as the previous close. Otherwise it's the last trading day's, from its close.
    if (tradingToday && minutes < hours.from) {
        const day = previousWeekday(today);
        return { session, mode: "final", day, window: lastHour(day), reference: "previousClose" };
    }
    return { session, mode: "final", day: quoteDay, window: lastHour(quoteDay), reference: "price" };
}

// The reference price for one stock under a plan, only when its quote is from the day the plan assumes: a stock whose
// quote is a day behind the others would otherwise be measured from the wrong close
export function extendedReference(plan: ExtendedPlan, quote: { price: number; previousClose?: number; time?: number } | undefined, now: number) {
    if (!quote || quote.time === undefined) return undefined;
    const quoteDay = newYorkClock(quote.time).day;
    if (plan.mode === "live" && plan.session === "pre-market") return quoteDay < plan.day ? quote.price : undefined;
    if (plan.reference === "price") {
        // After hours are measured from that day's close, which the quote has once it's from that day and the session closed
        return quoteDay === plan.day && now >= newYorkInstant(plan.day, CLOSE) ? quote.price : undefined;
    }
    // A previous close: today's quote's, for today's pre-market or yesterday's after hours
    return plan.session === "pre-market" ? (quoteDay === plan.day ? quote.previousClose : undefined) : quoteDay > plan.day ? quote.previousClose : undefined;
}

// Whether a trade time falls inside a window
export const inWindow = (time: number, window: Window) => time >= window.start && time < window.end;
