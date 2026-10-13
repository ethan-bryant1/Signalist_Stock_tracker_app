import { describe, expect, it } from "vitest";
import {
    DEFAULT_NEWS_PREFS,
    MAX_SAVED,
    canonicalUrl,
    countByTicker,
    formatEps,
    fromCompanyArticle,
    formatNewsAge,
    formatNewsTime,
    formatRevenue,
    groupByDay,
    mergeNews,
    normalizeArticle,
    normalizeEarnings,
    parseNewsPrefs,
    parseSaved,
    parseTickers,
    searchNews,
    selectEarnings,
    sortNews,
    surprise,
    toSaved,
    toggleSaved,
    withTickers,
    type NewsItem,
} from "@/lib/news";

// 2026-10-13 15:00 New York (19:00 UTC, daylight time)
const NOW = Date.UTC(2026, 9, 13, 19, 0);
const sec = (ms: number) => Math.floor(ms / 1000);

const item = (over: Partial<NewsItem> = {}): NewsItem => ({
    id: "m1",
    headline: "Stocks rise",
    summary: "",
    source: "Reuters",
    url: "https://example.com/a",
    datetime: NOW - 60_000,
    feed: "markets",
    tickers: [],
    ...over,
});

describe("normalizeArticle", () => {
    it("keeps the provider's fields and converts seconds to milliseconds", () => {
        const got = normalizeArticle({ id: 7, headline: "  Apple  beats ", summary: "Sales up.", source: "CNBC", url: "https://cnbc.com/x", datetime: sec(NOW - 3_600_000), related: "AAPL,msft" }, "markets", NOW);
        expect(got).toEqual({ id: "m7", headline: "Apple beats", summary: "Sales up.", source: "CNBC", url: "https://cnbc.com/x", datetime: sec(NOW - 3_600_000) * 1000, feed: "markets", tickers: ["AAPL", "MSFT"] });
    });

    it("drops articles without a headline, a web link or a sane time", () => {
        expect(normalizeArticle({ headline: "", url: "https://a.com", datetime: sec(NOW) }, "markets", NOW)).toBeNull();
        expect(normalizeArticle({ headline: "x", url: "javascript:alert(1)", datetime: sec(NOW) }, "markets", NOW)).toBeNull();
        expect(normalizeArticle({ headline: "x", url: "https://a.com", datetime: 0 }, "markets", NOW)).toBeNull();
        expect(normalizeArticle({ headline: "x", url: "https://a.com", datetime: sec(NOW + 3 * 86_400_000) }, "markets", NOW)).toBeNull();
    });

    it("adds the requested company's ticker, says when the source is missing, and drops a summary that repeats the headline", () => {
        const got = normalizeArticle({ headline: "Nvidia news", summary: "nvidia NEWS", url: "https://a.com/n", datetime: sec(NOW) }, "company", NOW, "NVDA");
        expect(got?.tickers).toEqual(["NVDA"]);
        expect(got?.source).toBe("Source not given");
        expect(got?.summary).toBe("");
        expect(got?.id).toBe("uhttps://a.com/n");
    });

    it("parses only ticker-shaped symbols", () => {
        expect(parseTickers("AAPL, BRK.B,,not a ticker!,aapl")).toEqual(["AAPL", "BRK.B"]);
        expect(parseTickers(undefined)).toEqual([]);
    });
});

describe("mergeNews", () => {
    it("removes the same story from two feeds (tracking parameters and www ignored) and keeps both tickers", () => {
        const a = item({ id: "c1", url: "https://www.example.com/story/?utm_source=x", tickers: ["AAPL"], feed: "company" });
        const b = item({ id: "c2", url: "https://example.com/story", tickers: ["MSFT"], summary: "More.", feed: "company" });
        const merged = mergeNews([[a], [b]]);
        expect(merged).toHaveLength(1);
        expect(merged[0].tickers).toEqual(["AAPL", "MSFT"]);
        expect(merged[0].summary).toBe("More.");
        // The inputs aren't changed
        expect(a.tickers).toEqual(["AAPL"]);
    });

    it("treats the same headline from the same publisher as one story, but not from different publishers", () => {
        const one = item({ url: "https://a.com/1", headline: "Fed holds rates!" });
        const same = item({ url: "https://a.com/2", headline: "fed holds rates" });
        const other = item({ url: "https://b.com/3", headline: "Fed holds rates", source: "CNBC" });
        expect(mergeNews([[one, same, other]])).toHaveLength(2);
    });

    it("sorts newest first", () => {
        const old = item({ url: "https://a.com/old", headline: "Old", datetime: NOW - 7_200_000 });
        const recent = item({ url: "https://a.com/new", headline: "New", datetime: NOW - 60_000 });
        expect(mergeNews([[old, recent]]).map((x) => x.headline)).toEqual(["New", "Old"]);
    });

    it("canonicalUrl keeps meaningful query parameters", () => {
        expect(canonicalUrl("https://www.Site.com/a/?id=5&utm_medium=email")).toBe("site.com/a?id=5");
    });
});

describe("search, order and symbols", () => {
    const list = [
        item({ url: "https://a.com/1", headline: "Apple beats estimates", tickers: ["AAPL"], datetime: NOW - 1000 }),
        item({ url: "https://a.com/2", headline: "Oil slides", source: "Bloomberg", datetime: NOW - 2000 }),
        item({ url: "https://a.com/3", headline: "Chip rally", summary: "Nvidia leads", tickers: ["NVDA", "AMD"], datetime: NOW - 3000 }),
    ];

    it("needs every word, in the headline, summary, source or tickers", () => {
        expect(searchNews(list, "apple").map((x) => x.url)).toEqual(["https://a.com/1"]);
        expect(searchNews(list, "nvidia rally")).toHaveLength(1);
        expect(searchNews(list, "bloomberg")).toHaveLength(1);
        expect(searchNews(list, "amd")).toHaveLength(1);
        expect(searchNews(list, "  ")).toHaveLength(3);
    });

    it("orders by time either way", () => {
        expect(sortNews(list, "oldest").map((x) => x.url)).toEqual(["https://a.com/3", "https://a.com/2", "https://a.com/1"]);
    });

    it("filters and counts by symbol", () => {
        expect(withTickers(list, new Set(["NVDA"]))).toHaveLength(1);
        expect(withTickers(list, new Set())).toHaveLength(3);
        expect(countByTicker(list, ["AAPL", "AMD", "TSLA"])).toEqual({ AAPL: 1, AMD: 1, TSLA: 0 });
    });
});

describe("times", () => {
    it("shows the time alone today and the day before otherwise, in New York time", () => {
        expect(formatNewsTime(Date.UTC(2026, 9, 13, 13, 30), NOW)).toBe("9:30 AM ET");
        expect(formatNewsTime(Date.UTC(2026, 9, 12, 20, 5), NOW)).toBe("Mon, Oct 12, 4:05 PM ET");
        expect(formatNewsTime(Date.UTC(2025, 11, 31, 17, 0), NOW)).toBe("Wed, Dec 31, 2025, 12:00 PM ET");
        // 1 AM UTC on the 13th is still the 12th in New York
        expect(formatNewsTime(Date.UTC(2026, 9, 13, 1, 0), NOW)).toBe("Mon, Oct 12, 9:00 PM ET");
    });

    it("handles standard time after the November change", () => {
        const winter = Date.UTC(2026, 10, 10, 15, 0);
        expect(formatNewsTime(winter, winter)).toBe("10:00 AM ET");
    });

    it("ages", () => {
        expect(formatNewsAge(NOW - 20_000, NOW)).toBe("Just now");
        expect(formatNewsAge(NOW + 60_000, NOW)).toBe("Just now");
        expect(formatNewsAge(NOW - 12 * 60_000, NOW)).toBe("12m ago");
        expect(formatNewsAge(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
        expect(formatNewsAge(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
        expect(formatNewsAge(NOW - 40 * 86_400_000, NOW)).toBe("5w ago");
    });

    it("groups by New York day", () => {
        const groups = groupByDay(
            [item({ datetime: NOW - 60_000 }), item({ datetime: Date.UTC(2026, 9, 12, 14) }), item({ datetime: Date.UTC(2026, 9, 9, 14) })],
            NOW
        );
        expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Fri, Oct 9"]);
    });
});

describe("settings and bookmarks", () => {
    it("falls back to defaults for anything unknown", () => {
        expect(parseNewsPrefs(null)).toEqual(DEFAULT_NEWS_PREFS);
        expect(parseNewsPrefs({ tab: "earnings", sort: "sideways", density: "compact", events: "fed", importance: "high" })).toEqual({
            ...DEFAULT_NEWS_PREFS,
            tab: "earnings",
            density: "compact",
            events: "fed",
        });
        expect(parseNewsPrefs({ events: "parties" }).events).toBe("all");
    });

    it("saves and removes by link, newest saved first, at most MAX_SAVED", () => {
        const a = toSaved(item({ url: "https://a.com/1" }), 1);
        const b = toSaved(item({ url: "https://a.com/2" }), 2);
        let saved = toggleSaved([], a);
        saved = toggleSaved(saved, b);
        expect(saved.map((x) => x.url)).toEqual(["https://a.com/2", "https://a.com/1"]);
        expect(toggleSaved(saved, a).map((x) => x.url)).toEqual(["https://a.com/2"]);
        const many = Array.from({ length: MAX_SAVED + 5 }, (_, i) => toSaved(item({ url: `https://a.com/${i}` }), i));
        expect(parseSaved(many)).toHaveLength(MAX_SAVED);
        expect(parseSaved(many)[0].url).toBe(`https://a.com/${MAX_SAVED + 4}`);
    });

    it("rejects malformed bookmarks", () => {
        const good = toSaved(item(), 1);
        expect(parseSaved([good, { ...good, url: "javascript:x" }, { ...good, headline: "" }, { ...good, tickers: ["bad ticker"] }, "junk"])).toEqual([good]);
        expect(parseSaved("nope")).toEqual([]);
    });
});

describe("earnings", () => {
    it("keeps missing figures missing", () => {
        expect(normalizeEarnings({ symbol: "aapl", date: "2026-10-29", hour: "amc", quarter: 4, year: 2026, epsEstimate: 1.6, epsActual: null, revenueEstimate: 1.2e11 })).toEqual({
            symbol: "AAPL",
            date: "2026-10-29",
            hour: "amc",
            period: "Q4 2026",
            epsEstimate: 1.6,
            epsActual: undefined,
            revenueEstimate: 1.2e11,
            revenueActual: undefined,
        });
        expect(normalizeEarnings({ symbol: "X", date: "soon" })).toBeNull();
        expect(normalizeEarnings({ symbol: "X", date: "2026-10-29", hour: "whenever" })?.hour).toBe("unknown");
    });

    it("selects the asked-for symbols once each, by day then time of day", () => {
        const rows = [
            normalizeEarnings({ symbol: "MSFT", date: "2026-10-28", hour: "amc" })!,
            normalizeEarnings({ symbol: "KO", date: "2026-10-28", hour: "bmo" })!,
            normalizeEarnings({ symbol: "AAPL", date: "2026-10-27", hour: "amc" })!,
            normalizeEarnings({ symbol: "AAPL", date: "2026-10-27", hour: "amc" })!,
            normalizeEarnings({ symbol: "ZZZZ", date: "2026-10-27" })!,
        ];
        expect(selectEarnings(rows, new Set(["AAPL", "MSFT", "KO"])).map((e) => e.symbol)).toEqual(["AAPL", "KO", "MSFT"]);
    });

    it("computes the surprise only from a real result and a non-zero estimate", () => {
        expect(surprise(1.1, 1)).toBeCloseTo(0.1);
        expect(surprise(-0.5, -1)).toBeCloseTo(0.5);
        expect(surprise(undefined, 1)).toBeUndefined();
        expect(surprise(1, 0)).toBeUndefined();
    });

    it("formats figures", () => {
        expect(formatEps(1.234)).toBe("$1.23");
        expect(formatEps(-0.4)).toBe("-$0.40");
        expect(formatEps(undefined)).toBe("—");
        expect(formatRevenue(94_930_000_000)).toBe("$94.93B");
        expect(formatRevenue(812_000_000)).toBe("$812.0M");
        expect(formatRevenue(undefined)).toBe("—");
    });
});

describe("fromCompanyArticle", () => {
    it("turns the stock page's article shape into a row", () => {
        const row = fromCompanyArticle({ id: 3, headline: "H", summary: "S", source: "X", url: "https://x.com", datetime: 1_700_000_000, category: "company", related: "AAPL", image: "" });
        expect(row).toMatchObject({ id: "c3", datetime: 1_700_000_000_000, feed: "company", tickers: ["AAPL"] });
    });
});
