"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import EarningsTable from "@/components/news/EarningsTable";
import EconomicCalendar from "@/components/news/EconomicCalendar";
import NewsList from "@/components/news/NewsList";
import { useNow } from "@/hooks/useHeatmapFeed";
import { saveNewsSettings, toggleBookmark } from "@/lib/actions/news.actions";
import { newYorkClock } from "@/lib/market-data";
import {
    countByTicker,
    formatNewsTime,
    mergeNews,
    savedToItem,
    searchNews,
    sortNews,
    toSaved,
    toggleSaved,
    withTickers,
    type NewsItem,
    type NewsPrefs,
    type NewsTab,
    type SavedArticle,
} from "@/lib/news";
import type { EarningsResult, NewsResult, SymbolNewsStatus } from "@/lib/news-data";
import { ISSUE_WORDS } from "@/lib/price-stamp";
import { cn } from "@/lib/utils";

// How often the open page asks for new headlines (only while it's visible). The server reuses Finnhub's answers
// for 10 minutes (market news) and 30 minutes (company news), so this never adds requests beyond those.
const REFRESH_MS = 15 * 60_000;
// Must match WATCHLIST_NEWS_CHUNK on the server
const WATCHLIST_CHUNK = 12;

const TAB_LABELS: Record<NewsTab, string> = { all: "All news", markets: "Markets", deals: "M&A", watchlist: "My watchlists", earnings: "Earnings", saved: "Saved" };
const TAB_ORDER: NewsTab[] = ["all", "markets", "deals", "watchlist", "earnings", "saved"];

type WatchState = { items: NewsItem[]; status: Record<string, SymbolNewsStatus>; fetchedAt?: number; stale: boolean; issue?: NewsResult["issue"]; loading: boolean; failed: boolean };

class FeedError extends Error {}

const getJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 401) throw new FeedError("signed-out");
    if (!response.ok) throw new FeedError("failed");
    return (await response.json()) as T;
};

const chunk = <T,>(items: readonly T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

type Props = {
    initialMarket: NewsResult;
    watchlistSymbols: string[];
    initialPrefs: NewsPrefs;
    initialSaved: SavedArticle[];
    // Settings and bookmarks couldn't be read; changes still apply on this page
    prefsUnavailable: boolean;
    renderedAt: number;
};

// The News page: market, M&A and watchlist headlines from Finnhub with search and bookmarks, the earnings calendar,
// and TradingView's economic calendar beside them. Settings and bookmarks are saved with the account.
const NewsCenter = ({ initialMarket, watchlistSymbols, initialPrefs, initialSaved, prefsUnavailable, renderedAt }: Props) => {
    const ids = useId();
    const now = useNow(renderedAt);
    const [prefs, setPrefs] = useState(initialPrefs);
    const [query, setQuery] = useState("");
    const [market, setMarket] = useState(initialMarket);
    const [marketLoading, setMarketLoading] = useState(false);
    const [marketFailed, setMarketFailed] = useState(false);
    const [watch, setWatch] = useState<WatchState>({ items: [], status: {}, stale: false, loading: false, failed: false });
    const [tickerFilter, setTickerFilter] = useState<string | null>(null);
    const [earnings, setEarnings] = useState<EarningsResult | null>(null);
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [earningsScope, setEarningsScope] = useState<"watchlist" | "sp500">(watchlistSymbols.length > 0 ? "watchlist" : "sp500");
    const [saved, setSaved] = useState(initialSaved);
    const tabsRef = useRef<HTMLDivElement>(null);
    const lastRefresh = useRef(renderedAt);
    const warnedSave = useRef(false);
    const tab = prefs.tab;

    // ---------- Settings ----------

    // The latest settings, so quick changes in a row each save on top of the one before
    const prefsRef = useRef(initialPrefs);
    const changePrefs = useCallback((change: Partial<NewsPrefs>) => {
        const next = { ...prefsRef.current, ...change };
        prefsRef.current = next;
        setPrefs(next);
        void saveNewsSettings(next).then((result) => {
            if (!result.ok && !warnedSave.current) {
                warnedSave.current = true;
                toast.error("Your news settings couldn't be saved. They apply on this page until you leave it.");
            }
        });
    }, []);

    // ---------- Feeds ----------

    const loadMarket = useCallback(async () => {
        setMarketLoading(true);
        try {
            const next = await getJson<NewsResult>("/api/news?feed=market");
            // A failed refresh keeps what's on screen (and says so) instead of emptying the page
            setMarket((previous) => (next.items.length > 0 || previous.items.length === 0 ? next : { ...previous, issue: next.issue ?? "provider", stale: true }));
            setMarketFailed(false);
        } catch {
            setMarketFailed(true);
        } finally {
            setMarketLoading(false);
        }
    }, []);

    const loadWatch = useCallback(async (symbols: readonly string[]) => {
        if (symbols.length === 0) return;
        setWatch((previous) => ({ ...previous, loading: true, failed: false }));
        let failed = false;
        for (const part of chunk(symbols, WATCHLIST_CHUNK)) {
            try {
                const got = await getJson<Omit<WatchState, "loading" | "failed">>(`/api/news?feed=watchlist&symbols=${encodeURIComponent(part.join(","))}`);
                setWatch((previous) => ({
                    ...previous,
                    items: mergeNews([got.items, previous.items]),
                    status: { ...previous.status, ...got.status },
                    fetchedAt: got.fetchedAt === undefined ? previous.fetchedAt : Math.min(previous.fetchedAt ?? Infinity, got.fetchedAt),
                    stale: previous.stale || got.stale,
                    issue: got.issue ?? previous.issue,
                }));
            } catch {
                failed = true;
                break;
            }
        }
        setWatch((previous) => ({ ...previous, loading: false, failed }));
    }, []);

    const loadEarnings = useCallback(async () => {
        setEarningsLoading(true);
        try {
            setEarnings(await getJson<EarningsResult>(`/api/news?feed=earnings&symbols=${encodeURIComponent(watchlistSymbols.slice(0, 500).join(","))}`));
        } catch {
            setEarnings((previous) => previous ?? { events: [], names: {}, from: "", to: "", stale: false, issue: "network" });
        } finally {
            setEarningsLoading(false);
        }
    }, [watchlistSymbols]);

    // Watchlist news and earnings load the first time their tab opens
    const watchRequested = useRef(false);
    const earningsRequested = useRef(false);
    useEffect(() => {
        if (tab === "watchlist" && !watchRequested.current) {
            watchRequested.current = true;
            void loadWatch(watchlistSymbols);
        }
        if (tab === "earnings" && !earningsRequested.current) {
            earningsRequested.current = true;
            void loadEarnings();
        }
    }, [tab, loadWatch, loadEarnings, watchlistSymbols]);

    // Refresh what's open: headlines on the page's timer or a click; the earnings calendar only on a click
    const refresh = useCallback(
        (manual: boolean) => {
            lastRefresh.current = Date.now();
            if (tab === "watchlist") void loadWatch(watchlistSymbols);
            else if (tab === "earnings") {
                if (manual) void loadEarnings();
            } else void loadMarket();
        },
        [tab, loadWatch, loadEarnings, loadMarket, watchlistSymbols]
    );

    // Every 15 minutes while the page is visible; a tab that sat hidden catches up when shown again
    useEffect(() => {
        const tick = () => {
            if (document.visibilityState === "visible" && Date.now() - lastRefresh.current >= REFRESH_MS - 1000) refresh(false);
        };
        const timer = window.setInterval(tick, REFRESH_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [refresh]);

    // ---------- Bookmarks ----------

    const savedUrls = useMemo(() => new Set(saved.map((item) => item.url)), [saved]);
    const onToggleSave = useCallback((item: NewsItem) => {
        const article = toSaved(item, Date.now());
        setSaved((previous) => toggleSaved(previous, article));
        void toggleBookmark(article).then((result) => {
            if (result.ok) setSaved(result.saved);
            else {
                // Undo just this change, keeping any made since
                setSaved((previous) => toggleSaved(previous, article));
                toast.error("That bookmark couldn't be saved. Try again.");
            }
        });
    }, []);

    // ---------- What the list shows ----------

    const marketItems = useMemo(() => {
        if (tab === "markets") return market.items.filter((item) => item.feed === "markets");
        if (tab === "deals") return market.items.filter((item) => item.feed === "deals");
        return market.items;
    }, [market.items, tab]);

    const tickerCounts = useMemo(() => countByTicker(watch.items, watchlistSymbols), [watch.items, watchlistSymbols]);

    const listItems = useMemo(() => {
        const base =
            tab === "watchlist"
                ? withTickers(watch.items, new Set(tickerFilter ? [tickerFilter] : watchlistSymbols))
                : tab === "saved"
                  ? saved.map(savedToItem)
                  : marketItems;
        return sortNews(searchNews(base, query), prefs.sort);
    }, [tab, watch.items, tickerFilter, watchlistSymbols, saved, marketItems, query, prefs.sort]);

    const earningsEvents = useMemo(() => {
        if (!earnings) return [];
        const inScope = earnings.events.filter((event) => (earningsScope === "watchlist" ? watchlistSymbols.includes(event.symbol) : earnings.names[event.symbol] !== undefined));
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return words.length === 0 ? inScope : inScope.filter((event) => words.every((word) => `${event.symbol} ${earnings.names[event.symbol] ?? ""}`.toLowerCase().includes(word)));
    }, [earnings, earningsScope, watchlistSymbols, query]);

    // ---------- Status line ----------

    const waiting = watchlistSymbols.filter((symbol) => watch.status[symbol] === "waiting" || watch.status[symbol] === "failed");
    const loadedCount = watchlistSymbols.filter((symbol) => watch.status[symbol] === "ok").length;

    const status = (() => {
        if (tab === "saved") return { text: `${saved.length} saved ${saved.length === 1 ? "article" : "articles"} · newest saved first in your account`, warning: false };
        if (tab === "earnings") {
            if (!earnings) return { text: "Finnhub earnings calendar", warning: false };
            if (earnings.issue) return { text: `Earnings couldn't load: ${ISSUE_WORDS[earnings.issue]}`, warning: true };
            return {
                text: `Finnhub · S&P 500 and your watchlists · updated ${earnings.fetchedAt ? formatNewsTime(earnings.fetchedAt, now) : "—"}${earnings.stale ? " (saved copy)" : ""}`,
                warning: earnings.stale,
            };
        }
        if (tab === "watchlist") {
            if (watchlistSymbols.length === 0) return { text: "Finnhub company news", warning: false };
            const base = `Finnhub · ${loadedCount} of ${watchlistSymbols.length} symbols loaded · last 3 days`;
            if (watch.failed) return { text: `${base} · loading stopped, try Refresh`, warning: true };
            if (watch.stale) return { text: `${base} · some are saved copies from ${watch.fetchedAt ? formatNewsTime(watch.fetchedAt, now) : "earlier"}`, warning: true };
            return { text: base, warning: false };
        }
        if (marketFailed) return { text: `Couldn't refresh · showing headlines from ${market.fetchedAt ? formatNewsTime(market.fetchedAt, now) : "earlier"}`, warning: true };
        if (market.items.length === 0 && market.issue) return { text: `Headlines couldn't load: ${ISSUE_WORDS[market.issue]}`, warning: true };
        if (market.stale || market.issue)
            return { text: `Couldn't refresh${market.issue ? `: ${ISSUE_WORDS[market.issue]}` : ""} · showing headlines from ${market.fetchedAt ? formatNewsTime(market.fetchedAt, now) : "earlier"}`, warning: true };
        return { text: `Finnhub · updated ${market.fetchedAt ? formatNewsTime(market.fetchedAt, now) : "—"}`, warning: false };
    })();

    const busy = tab === "watchlist" ? watch.loading : tab === "earnings" ? earningsLoading : marketLoading;

    // On a narrow screen the open category may start out of view
    useEffect(() => {
        tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [tab]);

    const onTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const at = TAB_ORDER.indexOf(tab);
        const to = event.key === "Home" ? 0 : event.key === "End" ? TAB_ORDER.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + TAB_ORDER.length) % TAB_ORDER.length;
        changePrefs({ tab: TAB_ORDER[to] });
        requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${TAB_ORDER[to]}"]`)?.focus());
    };

    const panelId = `${ids}-panel`;
    const today = newYorkClock(now).day;

    // ---------- Content ----------

    const content = (() => {
        if (tab === "earnings") {
            if (!earnings) return <Loading label="Loading the earnings calendar" />;
            if (earnings.issue && earnings.events.length === 0) return <Empty>The earnings calendar couldn&apos;t load: {ISSUE_WORDS[earnings.issue]}. Try Refresh in a minute.</Empty>;
            if (earningsEvents.length === 0)
                return (
                    <Empty>
                        {query.trim()
                            ? `No earnings reports match “${query.trim()}”.`
                            : earningsScope === "watchlist"
                              ? "None of your watchlist symbols report earnings between these dates. Switch to the S&P 500 to see every report."
                              : "No S&P 500 earnings reports between these dates."}
                    </Empty>
                );
            return <EarningsTable events={earningsEvents} today={today} names={earnings.names} />;
        }
        if (tab === "watchlist") {
            if (watchlistSymbols.length === 0)
                return (
                    <Empty>
                        Your watchlists are empty. Add symbols on the{" "}
                        <Link href="/watchlist" className="font-semibold text-gray-100 underline underline-offset-2">
                            Watchlist page
                        </Link>{" "}
                        to see their news here.
                    </Empty>
                );
            if (watch.items.length === 0 && watch.loading) return <Loading label="Loading news for your watchlists" />;
        }
        if (tab !== "saved" && tab !== "watchlist" && market.items.length === 0)
            return market.issue ? <Empty>Headlines couldn&apos;t load: {ISSUE_WORDS[market.issue]}. Nothing is shown in their place; try Refresh in a minute.</Empty> : <Empty>Finnhub sent no headlines.</Empty>;
        if (listItems.length === 0) {
            if (query.trim()) return <Empty>No headlines match “{query.trim()}”.</Empty>;
            if (tab === "saved") return <Empty>Nothing saved yet. Use the bookmark beside a headline to keep it here.</Empty>;
            if (tab === "watchlist") return <Empty>{tickerFilter ? `No news about ${tickerFilter} in the last 3 days.` : "No news about your watchlist symbols in the last 3 days."}</Empty>;
            return <Empty>No headlines in this category right now.</Empty>;
        }
        return (
            <NewsList
                key={`${tab}|${query}|${prefs.sort}|${tickerFilter}`}
                items={listItems}
                now={now}
                density={prefs.density}
                showFeed={tab === "all" || tab === "saved"}
                savedUrls={savedUrls}
                onToggleSave={onToggleSave}
                label={`${TAB_LABELS[tab]} headlines`}
            />
        );
    })();

    return (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <section aria-label="News" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-800">
                {/* Categories */}
                <div ref={tabsRef} role="tablist" aria-label="News categories" onKeyDown={onTabKeys} className="scrollbar-hide-default flex items-center gap-1 overflow-x-auto border-b border-gray-600 px-2 py-2">
                    {TAB_ORDER.map((key) => {
                        const selected = key === tab;
                        const count = key === "watchlist" ? watchlistSymbols.length : key === "saved" ? saved.length : undefined;
                        return (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                data-tab={key}
                                aria-selected={selected}
                                aria-controls={panelId}
                                tabIndex={selected ? 0 : -1}
                                onClick={() => changePrefs({ tab: key })}
                                className={cn(
                                    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                    selected ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                                )}
                            >
                                {TAB_LABELS[key]}
                                {count !== undefined && <span className={cn("tabular-nums", selected ? "text-gray-600" : "text-gray-500")}>{count}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Search, order, row height, refresh and where the headlines came from */}
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-600 px-3 py-2">
                    <label htmlFor={`${ids}-search`} className="sr-only">
                        {tab === "earnings" ? "Search earnings by symbol or company" : "Search loaded headlines"}
                    </label>
                    <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
                        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                        <input
                            id={`${ids}-search`}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={tab === "earnings" ? "Symbol or company" : "Search headlines, sources, tickers"}
                            autoComplete="off"
                            className="h-8 w-full rounded-lg border border-gray-600 bg-gray-900 pl-8 pr-2.5 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400"
                        />
                    </div>
                    {tab === "earnings" ? (
                        <div role="radiogroup" aria-label="Companies" className="flex rounded-lg border border-gray-600 p-0.5">
                            {(["watchlist", "sp500"] as const).map((scope) => (
                                <button
                                    key={scope}
                                    type="button"
                                    role="radio"
                                    aria-checked={earningsScope === scope}
                                    onClick={() => setEarningsScope(scope)}
                                    className={cn(
                                        "h-6 cursor-pointer rounded-md px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                        earningsScope === scope ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-100"
                                    )}
                                >
                                    {scope === "watchlist" ? "My watchlists" : "S&P 500"}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <>
                            <label htmlFor={`${ids}-sort`} className="sr-only">
                                Order
                            </label>
                            <select
                                id={`${ids}-sort`}
                                value={prefs.sort}
                                onChange={(event) => changePrefs({ sort: event.target.value === "oldest" ? "oldest" : "newest" })}
                                className="h-8 cursor-pointer rounded-lg border border-gray-600 bg-gray-900 px-2 text-xs text-gray-100"
                            >
                                <option value="newest">Newest first</option>
                                <option value="oldest">Oldest first</option>
                            </select>
                            <div role="radiogroup" aria-label="Row height" className="flex rounded-lg border border-gray-600 p-0.5">
                                {(["compact", "comfortable"] as const).map((density) => (
                                    <button
                                        key={density}
                                        type="button"
                                        role="radio"
                                        aria-checked={prefs.density === density}
                                        onClick={() => changePrefs({ density })}
                                        title={density === "compact" ? "Headlines only" : "Headlines with summaries"}
                                        className={cn(
                                            "h-6 cursor-pointer rounded-md px-2 text-[11px] font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                            prefs.density === density ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-100"
                                        )}
                                    >
                                        {density}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {tab !== "saved" && (
                        <button
                            type="button"
                            onClick={() => refresh(true)}
                            disabled={busy}
                            title="Ask for new headlines (Finnhub's answers are reused for 10 minutes)"
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100 disabled:cursor-wait disabled:opacity-60"
                        >
                            <RefreshCw aria-hidden className={cn("h-3.5 w-3.5", busy && "animate-spin motion-reduce:animate-none")} />
                            Refresh
                        </button>
                    )}
                    <p role="status" className={cn("flex min-w-0 basis-full items-center gap-1.5 text-[11px] sm:ml-auto sm:basis-auto", status.warning ? "font-medium text-gray-100" : "text-gray-500")}>
                        {status.warning && <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />}
                        <span className="truncate" title={status.text}>
                            {status.text}
                        </span>
                    </p>
                    {prefsUnavailable && <p className="basis-full text-[11px] text-gray-500">Your saved news settings couldn&apos;t be read, so the defaults are showing.</p>}
                </div>

                {/* Watchlist symbols: one at a time, or all */}
                {tab === "watchlist" && watchlistSymbols.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-gray-600 px-3 py-2">
                        <div role="radiogroup" aria-label="Symbol" className="scrollbar-hide-default flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                            {[null, ...watchlistSymbols].map((symbol) => {
                                const selected = tickerFilter === symbol;
                                const count = symbol ? tickerCounts[symbol] : watch.items.length;
                                const state = symbol ? watch.status[symbol] : undefined;
                                return (
                                    <button
                                        key={symbol ?? "all"}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setTickerFilter(symbol)}
                                        title={symbol ? (state === "ok" ? `${count} ${count === 1 ? "story" : "stories"} about ${symbol}` : state === "waiting" ? `${symbol} is waiting for the request budget` : state === "failed" ? `${symbol}'s news couldn't load` : `Loading ${symbol}`) : "Every symbol"}
                                        className={cn(
                                            "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                            selected ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-100",
                                            symbol && state === "ok" && count === 0 && !selected && "text-gray-500"
                                        )}
                                    >
                                        {symbol ?? "All symbols"}
                                        <span className={cn(selected ? "text-gray-600" : "text-gray-500")}>{symbol && state !== "ok" ? (state === "waiting" || state === "failed" ? "!" : "…") : count}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {waiting.length > 0 && !watch.loading && (
                            <button
                                type="button"
                                onClick={() => void loadWatch(waiting)}
                                title={waiting.join(", ")}
                                className="h-7 shrink-0 cursor-pointer rounded-md border border-gray-600 px-2 text-[11px] font-semibold text-gray-100 hover:border-gray-500"
                            >
                                Load {waiting.length} more
                            </button>
                        )}
                    </div>
                )}

                <div id={panelId} role="tabpanel" aria-label={TAB_LABELS[tab]} aria-busy={busy} className="min-h-[24rem]">
                    {content}
                </div>
            </section>

            <EconomicCalendar
                importance={prefs.importance}
                region={prefs.region}
                onChange={(change) => changePrefs(change)}
                className="h-[44rem] xl:sticky xl:top-28 xl:h-[calc(100dvh-8.5rem)] xl:min-h-[36rem]"
            />
        </div>
    );
};

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-10 text-center text-sm text-gray-400">{children}</p>;

const Loading = ({ label }: { label: string }) => (
    <div aria-label={label} role="status" className="flex flex-col divide-y divide-gray-600/70">
        {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-2 px-4 py-3">
                <div className="h-3 w-40 animate-pulse rounded bg-gray-700 motion-reduce:animate-none" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-gray-700 motion-reduce:animate-none" />
            </div>
        ))}
    </div>
);

export default NewsCenter;
