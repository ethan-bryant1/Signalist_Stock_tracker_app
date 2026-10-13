// The small label beside a price that says where it came from and how old it is, so a cached, delayed or
// last-session price is never read as a live one. No server or browser APIs, so it's unit tested directly.

import { STALE_IN_SESSION_MS, formatNewYorkMoment, newYorkClock, type FeedIssue, type MarketSession } from "@/lib/market-data";

export type StampInput = {
    hasPrice: boolean;
    // The provider's time for the price, in milliseconds
    quoteTime?: number;
    // The price came from our cache because a fresh copy couldn't be fetched
    cached?: boolean;
    // Why the price is missing or couldn't refresh
    issue?: FeedIssue;
    session: MarketSession;
    now: number;
    source?: string;
};

export type Stamp = {
    // Short text shown next to the price
    text: string;
    // "warning" for anything a trader should notice: no price, a cached copy, a delayed price
    tone: "normal" | "warning";
    // The longer explanation for a tooltip and screen readers
    detail: string;
};

export const ISSUE_WORDS: Record<FeedIssue, string> = {
    "not-configured": "no API key is set on the server",
    auth: "the provider refused the API key",
    "rate-limit": "the provider's rate limit was reached",
    busy: "waiting for the free plan's request budget",
    provider: "the provider returned an error",
    network: "the provider couldn't be reached",
};

export function priceStamp({ hasPrice, quoteTime, cached, issue, session, now, source = "Finnhub" }: StampInput): Stamp {
    if (!hasPrice) {
        const why = issue ? ISSUE_WORDS[issue] : "the provider has no price for it";
        return { text: "No price", tone: "warning", detail: `No price is shown because ${why}. Prices are never filled in or guessed.` };
    }
    if (quoteTime === undefined) {
        return { text: `${source} · time unknown`, tone: "warning", detail: `${source} sent this price without a time, so its age is unknown.` };
    }

    const moment = formatNewYorkMoment(quoteTime, now);
    if (cached) {
        const why = issue ? ISSUE_WORDS[issue] : "a fresh copy couldn't be fetched";
        return { text: `Cached · ${moment}`, tone: "warning", detail: `Our last saved ${source} price, from ${moment}: ${why}.` };
    }

    const sameDay = newYorkClock(quoteTime).day === newYorkClock(now).day;
    if (session === "regular") {
        if (now - quoteTime > STALE_IN_SESSION_MS) {
            return { text: `Delayed · ${moment}`, tone: "warning", detail: `${source}'s latest price is from ${moment}, more than 15 minutes ago, while the market is open.` };
        }
        return {
            text: `${source} · ${moment}`,
            tone: "normal",
            detail: `Last trade time reported by ${source}, refreshed about once a minute. ${source} doesn't publish which exchanges its free quote covers, so treat it as near real-time, not a consolidated feed.`,
        };
    }
    // Outside the session Finnhub's quote is the regular session's close (4:00 PM ET)
    return {
        text: `Close · ${moment}`,
        tone: "normal",
        detail: `${sameDay ? "Today's" : "The last session's"} closing price from ${source}, as of ${moment}. Pre-market and after-hours trades aren't included.`,
    };
}
