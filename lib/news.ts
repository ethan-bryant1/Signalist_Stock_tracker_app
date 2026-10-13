// The News page's rules: turning provider articles into one shape, removing repeats, searching, the saved settings
// and bookmarks, and the earnings calendar's rows. No server or browser APIs, so it's unit tested directly
// (tests/news.test.ts). Nothing here writes a headline, summary, ticker or figure the provider didn't send.

import { formatNewYorkDay, formatNewYorkTime, newYorkClock } from "@/lib/market-data";

// ---------- Articles ----------

// Where an article came from: Finnhub's market news (general), its mergers feed, or one company's news
export type NewsFeed = "markets" | "deals" | "company";

export type NewsItem = {
    // Stable across refreshes: the provider's id when it sends one, otherwise the link
    id: string;
    headline: string;
    // The provider's own summary, or "" when it sent none (never written by us)
    summary: string;
    // The publisher as the provider names it
    source: string;
    url: string;
    // Publication time in milliseconds (the provider sends seconds)
    datetime: number;
    feed: NewsFeed;
    // Symbols the provider tied to the article, upper case; empty when it named none
    tickers: string[];
};

export type ProviderArticle = {
    id?: number | string;
    headline?: string;
    summary?: string;
    source?: string;
    url?: string;
    datetime?: number;
    related?: string;
    category?: string;
};

const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
// Provider timestamps before 2000 or more than a day ahead are broken, not news
const EARLIEST = Date.UTC(2000, 0, 1);

export const parseTickers = (related: string | undefined): string[] =>
    [...new Set((related ?? "").split(",").map((part) => part.trim().toUpperCase()).filter((part) => TICKER.test(part)))];

// One provider article in the page's shape, or null when it lacks a headline, a web link or a sane time.
// `ticker` is the symbol a company-news request was for, since Finnhub's `related` can be empty there.
export function normalizeArticle(raw: ProviderArticle, feed: NewsFeed, now: number, ticker?: string): NewsItem | null {
    const headline = typeof raw.headline === "string" ? raw.headline.replace(/\s+/g, " ").trim() : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    const seconds = typeof raw.datetime === "number" && Number.isFinite(raw.datetime) ? raw.datetime : 0;
    const datetime = seconds * 1000;
    if (!headline || !/^https?:\/\/[^\s]+$/i.test(url) || datetime < EARLIEST || datetime > now + 24 * 60 * 60_000) return null;

    const rawSummary = typeof raw.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim() : "";
    // Some feeds repeat the headline as the summary; showing it twice adds nothing
    const summary = rawSummary.toLowerCase() === headline.toLowerCase() ? "" : rawSummary;
    const tickers = parseTickers(raw.related);
    if (ticker && TICKER.test(ticker) && !tickers.includes(ticker)) tickers.unshift(ticker);
    const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : "Source not given";
    const id = raw.id !== undefined && raw.id !== null && String(raw.id) !== "0" ? `${feed === "company" ? "c" : "m"}${raw.id}` : `u${url}`;

    return { id, headline, summary, source, url, datetime, feed, tickers };
}

// An article from the older company-news shape (seconds, one related symbol) as a page row
export const fromCompanyArticle = (article: MarketNewsArticle): NewsItem => ({
    id: `c${article.id}`,
    headline: article.headline,
    summary: article.summary,
    source: article.source,
    url: article.url,
    datetime: article.datetime * 1000,
    feed: "company",
    tickers: parseTickers(article.related),
});

// The link without tracking parameters, fragment, "www." or a trailing slash, so the same story from two feeds matches
export const canonicalUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        const params = [...parsed.searchParams.entries()].filter(([key]) => !/^(utm_|guccounter|guce_|cmpid|ncid|mod$|siteid|yptr|src$)/i.test(key));
        const query = new URLSearchParams(params).toString();
        const path = parsed.pathname.replace(/\/+$/, "");
        return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${path}${query ? `?${query}` : ""}`;
    } catch {
        return url.trim().toLowerCase();
    }
};

const headlineKey = (headline: string) => headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// All the lists as one, newest first, each story once. Repeats (same link, or same headline from the same publisher)
// keep the first copy's text and gain the other copies' tickers, so a story found through two companies lists both.
export function mergeNews(lists: readonly (readonly NewsItem[])[]): NewsItem[] {
    const byKey = new Map<string, NewsItem>();
    const merged: NewsItem[] = [];
    for (const list of lists) {
        for (const item of list) {
            const keys = [`u:${canonicalUrl(item.url)}`, `h:${item.source.toLowerCase()}|${headlineKey(item.headline)}`];
            const existing = keys.map((key) => byKey.get(key)).find(Boolean);
            if (existing) {
                for (const ticker of item.tickers) if (!existing.tickers.includes(ticker)) existing.tickers.push(ticker);
                if (!existing.summary && item.summary) existing.summary = item.summary;
                keys.forEach((key) => byKey.set(key, existing));
                continue;
            }
            const copy = { ...item, tickers: [...item.tickers] };
            keys.forEach((key) => byKey.set(key, copy));
            merged.push(copy);
        }
    }
    return merged.sort((a, b) => b.datetime - a.datetime || a.headline.localeCompare(b.headline));
}

export type NewsSort = "newest" | "oldest";

// Articles containing every word of the search, in the headline, summary, source or tickers
export function searchNews(items: readonly NewsItem[], query: string): NewsItem[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [...items];
    return items.filter((item) => {
        const text = `${item.headline} ${item.summary} ${item.source} ${item.tickers.join(" ")}`.toLowerCase();
        return words.every((word) => text.includes(word));
    });
}

export const sortNews = (items: readonly NewsItem[], sort: NewsSort): NewsItem[] =>
    [...items].sort((a, b) => (sort === "oldest" ? a.datetime - b.datetime : b.datetime - a.datetime) || a.headline.localeCompare(b.headline));

// Articles about any of the symbols (all of them when the set is empty)
export const withTickers = (items: readonly NewsItem[], symbols: ReadonlySet<string>): NewsItem[] =>
    symbols.size === 0 ? [...items] : items.filter((item) => item.tickers.some((ticker) => symbols.has(ticker)));

// How many loaded articles mention each symbol, for the watchlist tab's symbol buttons
export const countByTicker = (items: readonly NewsItem[], symbols: readonly string[]): Record<string, number> => {
    const counts: Record<string, number> = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
    for (const item of items) for (const ticker of item.tickers) if (ticker in counts) counts[ticker]++;
    return counts;
};

// ---------- Times ----------

// "3:42 PM ET" today in New York, "Mon, Oct 12, 3:42 PM ET" otherwise (with the year when it isn't this year), so an
// old headline is never mistaken for today's
export function formatNewsTime(ms: number, now: number): string {
    const day = newYorkClock(ms).day;
    const today = newYorkClock(now).day;
    if (day === today) return `${formatNewYorkTime(ms)} ET`;
    const sameYear = day.slice(0, 4) === today.slice(0, 4);
    return `${formatNewYorkDay(ms)}${sameYear ? "" : `, ${day.slice(0, 4)}`}, ${formatNewYorkTime(ms)} ET`;
}

// "Just now", "12m ago", "3h ago", "2d ago", "5w ago"; times in the future (clock differences) read "Just now"
export function formatNewsAge(ms: number, now: number): string {
    const minutes = Math.floor((now - ms) / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
}

// Articles grouped under their New York day, in the order given ("Today", "Yesterday", "Mon, Oct 12")
export function groupByDay(items: readonly NewsItem[], now: number): { day: string; label: string; items: NewsItem[] }[] {
    const today = newYorkClock(now).day;
    const yesterday = newYorkClock(now - 24 * 60 * 60_000).day;
    const groups: { day: string; label: string; items: NewsItem[] }[] = [];
    for (const item of items) {
        const day = newYorkClock(item.datetime).day;
        let group = groups.at(-1);
        if (!group || group.day !== day) {
            const label = day === today ? "Today" : day === yesterday ? "Yesterday" : `${formatNewYorkDay(item.datetime)}${day.slice(0, 4) === today.slice(0, 4) ? "" : `, ${day.slice(0, 4)}`}`;
            group = { day, label, items: [] };
            groups.push(group);
        }
        group.items.push(item);
    }
    return groups;
}

// ---------- Saved settings and bookmarks ----------

export const NEWS_TABS = ["all", "markets", "deals", "watchlist", "earnings", "saved"] as const;
export type NewsTab = (typeof NEWS_TABS)[number];
export type NewsDensity = "compact" | "comfortable";
// Which upcoming events the side panel lists (lib/events.ts): everything, the Federal Reserve's, or data releases
export const EVENT_FILTERS = ["all", "fed", "data"] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

export type NewsPrefs = {
    tab: NewsTab;
    sort: NewsSort;
    density: NewsDensity;
    events: EventFilter;
};

export const DEFAULT_NEWS_PREFS: NewsPrefs = { tab: "all", sort: "newest", density: "comfortable", events: "all" };

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

// Saved settings with anything unknown replaced by the default, so an old or tampered copy never breaks the page
export const parseNewsPrefs = (value: unknown): NewsPrefs => {
    const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return {
        tab: pick(raw.tab, NEWS_TABS, DEFAULT_NEWS_PREFS.tab),
        sort: pick(raw.sort, ["newest", "oldest"] as const, DEFAULT_NEWS_PREFS.sort),
        density: pick(raw.density, ["compact", "comfortable"] as const, DEFAULT_NEWS_PREFS.density),
        events: pick(raw.events, EVENT_FILTERS, DEFAULT_NEWS_PREFS.events),
    };
};

export const MAX_SAVED = 100;
export type SavedArticle = Pick<NewsItem, "id" | "headline" | "source" | "url" | "datetime" | "tickers"> & { savedAt: number };

const isSavedArticle = (value: unknown): value is SavedArticle => {
    const raw = value as SavedArticle;
    return (
        !!raw &&
        typeof raw.id === "string" &&
        raw.id.length <= 600 &&
        typeof raw.headline === "string" &&
        raw.headline.length > 0 &&
        raw.headline.length <= 500 &&
        typeof raw.source === "string" &&
        raw.source.length <= 200 &&
        typeof raw.url === "string" &&
        /^https?:\/\//i.test(raw.url) &&
        raw.url.length <= 2000 &&
        typeof raw.datetime === "number" &&
        Number.isFinite(raw.datetime) &&
        typeof raw.savedAt === "number" &&
        Array.isArray(raw.tickers) &&
        raw.tickers.length <= 20 &&
        raw.tickers.every((ticker) => typeof ticker === "string" && TICKER.test(ticker))
    );
};

// Saved bookmarks, newest saved first, at most MAX_SAVED, without broken entries or repeats
export const parseSaved = (value: unknown): SavedArticle[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
        .filter(isSavedArticle)
        .filter((item) => !seen.has(item.url) && !!seen.add(item.url))
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, MAX_SAVED);
};

export const toSaved = (item: NewsItem, now: number): SavedArticle => ({
    id: item.id,
    headline: item.headline.slice(0, 500),
    source: item.source.slice(0, 200),
    url: item.url,
    datetime: item.datetime,
    tickers: item.tickers.slice(0, 20),
    savedAt: now,
});

// Adds the article, or removes it when it's already saved (matched by link). The oldest drop off past MAX_SAVED.
export const toggleSaved = (saved: readonly SavedArticle[], article: SavedArticle): SavedArticle[] =>
    saved.some((item) => item.url === article.url)
        ? saved.filter((item) => item.url !== article.url)
        : parseSaved([article, ...saved]);

// A bookmark shown in the list like any article (its summary isn't kept)
export const savedToItem = (saved: SavedArticle): NewsItem => ({ ...saved, tickers: [...saved.tickers], summary: "", feed: "markets" });

// ---------- Earnings calendar ----------

export type ProviderEarnings = {
    date?: string;
    epsActual?: number | null;
    epsEstimate?: number | null;
    hour?: string;
    quarter?: number;
    revenueActual?: number | null;
    revenueEstimate?: number | null;
    symbol?: string;
    year?: number;
};

export type EarningsEvent = {
    symbol: string;
    // The New York calendar day, "2026-10-14"
    date: string;
    // Before the open, after the close, during the session, or not given
    hour: "bmo" | "amc" | "dmh" | "unknown";
    // "Q3 2026" when the provider says which quarter
    period?: string;
    epsEstimate?: number;
    epsActual?: number;
    revenueEstimate?: number;
    revenueActual?: number;
};

const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// One provider row, or null when it has no symbol or date. Missing figures stay missing: an estimate is never
// shown as the result.
export function normalizeEarnings(raw: ProviderEarnings): EarningsEvent | null {
    const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
    const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
    if (!TICKER.test(symbol) || !date) return null;
    const hour = raw.hour === "bmo" || raw.hour === "amc" || raw.hour === "dmh" ? raw.hour : "unknown";
    const quarter = finite(raw.quarter);
    const year = finite(raw.year);
    return {
        symbol,
        date,
        hour,
        period: quarter && year && quarter >= 1 && quarter <= 4 ? `Q${quarter} ${year}` : undefined,
        epsEstimate: finite(raw.epsEstimate),
        epsActual: finite(raw.epsActual),
        revenueEstimate: finite(raw.revenueEstimate),
        revenueActual: finite(raw.revenueActual),
    };
}

export const EARNINGS_HOUR_LABELS: Record<EarningsEvent["hour"], string> = {
    bmo: "Before open",
    dmh: "During session",
    amc: "After close",
    unknown: "Time not given",
};

const HOUR_ORDER: Record<EarningsEvent["hour"], number> = { bmo: 0, dmh: 1, amc: 2, unknown: 3 };

// Rows for the given symbols, each once, by day then time of day then symbol
export function selectEarnings(events: readonly EarningsEvent[], symbols: ReadonlySet<string>): EarningsEvent[] {
    const seen = new Set<string>();
    return events
        .filter((event) => symbols.has(event.symbol))
        .filter((event) => {
            const key = `${event.symbol}|${event.date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || HOUR_ORDER[a.hour] - HOUR_ORDER[b.hour] || a.symbol.localeCompare(b.symbol));
}

// The result's difference from the estimate as a fraction of the estimate's size, only when both exist and the
// estimate isn't zero: (actual - estimate) / |estimate|
export const surprise = (actual: number | undefined, estimate: number | undefined): number | undefined =>
    actual === undefined || estimate === undefined || estimate === 0 ? undefined : (actual - estimate) / Math.abs(estimate);

// "$1.23" / "-$0.40"
export const formatEps = (value: number | undefined) => (value === undefined ? "—" : `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`);

// "$94.9B", "$812.0M"; Finnhub reports revenue in dollars
export const formatRevenue = (value: number | undefined) => {
    if (value === undefined) return "—";
    const size = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (size >= 1e12) return `${sign}$${(size / 1e12).toFixed(2)}T`;
    if (size >= 1e9) return `${sign}$${(size / 1e9).toFixed(2)}B`;
    if (size >= 1e6) return `${sign}$${(size / 1e6).toFixed(1)}M`;
    return `${sign}$${Math.round(size).toLocaleString("en-US")}`;
};

// "Wed, Oct 14" for a New York calendar day (noon avoids any daylight-saving edge)
export const formatCalendarDay = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return formatNewYorkDay(Date.UTC(year, month - 1, date, 16));
};
