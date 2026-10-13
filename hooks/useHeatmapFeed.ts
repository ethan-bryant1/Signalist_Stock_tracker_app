'use client';

import { useEffect, useState } from "react";
import { applyLiveTrades, newerQuote, type LiveTrade } from "@/lib/live-trades";
import type { HeatmapPayload, HeatmapStock } from "@/lib/market-data";

// The page asks for fresh prices every minute; the server caches each price for two to three minutes
const REFRESH_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const STREAM_RETRY_MS = 30_000;
const OFF: LiveStream = { state: "off", symbols: [] };

export type RefreshError = "signed-out" | "network" | "server";

// The live trade stream: off (outside the regular session, or no stream available), connecting, or live for the
// listed symbols
export type LiveStream = { state: "off" | "connecting" | "live"; symbols: string[]; reason?: string };

export type HeatmapFeed = HeatmapPayload & {
    live: LiveStream;
    // When the page last received prices (the server's time for its answer)
    lastSuccessAt: number;
    // Set while refreshing keeps failing, with when it started failing
    refreshError?: RefreshError;
    failingSince?: number;
};

const sameQuote = (a?: HeatmapStock["quote"], b?: HeatmapStock["quote"]) =>
    a === b || (!!a && !!b && a.price === b.price && a.time === b.time && a.previousClose === b.previousClose && a.dayHigh === b.dayHigh && a.dayLow === b.dayLow && a.open === b.open);

// Combines a refresh with what the page already shows. A stock whose quote didn't come back, or came back older
// than a live trade the page already applied, keeps its last quote
// as one unit, with that quote's own times, so it shows as stale instead of disappearing or mixing figures from
// two different moments. Unchanged stocks keep the same object, so their tiles don't redraw, and when nothing
// changed at all the previous list itself comes back, so nothing computed from it is redone.
const samePeriodStart = (a: HeatmapStock["periodStart"], b: HeatmapStock["periodStart"]) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = Object.keys(a) as (keyof typeof a)[];
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

export const mergeHeatmapStocks = (previous: HeatmapStock[], next: readonly HeatmapStock[]): HeatmapStock[] => {
    const before = new Map(previous.map((stock) => [stock.symbol, stock]));
    const merged = next.map((stock) => {
        const old = before.get(stock.symbol);
        if (!old) return stock;
        // The page's own quote stays when the refresh has none, or an older one than a live trade already gave
        const keepOld = !!old.quote && newerQuote(old.quote, stock.quote) === old.quote;
        const merged: HeatmapStock = {
            ...stock,
            quote: keepOld ? old.quote : stock.quote,
            fetchedAt: keepOld ? old.fetchedAt : stock.fetchedAt,
            marketCap: stock.marketCap ?? old.marketCap,
            logo: stock.logo ?? old.logo,
            exchange: stock.exchange ?? old.exchange,
            // Taken as the server sends them: it already keeps the last good stats while Finnhub fails, and drops them
            // once they're too old, so the page never carries a period's start past its window
            periodStart: stock.periodStart,
            averageVolume: stock.averageVolume,
        };
        const unchanged = sameQuote(merged.quote, old.quote) && merged.fetchedAt === old.fetchedAt && merged.marketCap === old.marketCap
            && merged.logo === old.logo && merged.exchange === old.exchange && merged.name === old.name
            && samePeriodStart(merged.periodStart, old.periodStart) && merged.averageVolume === old.averageVolume;
        return unchanged ? old : merged;
    });
    return merged.length === previous.length && merged.every((stock, index) => stock === previous[index]) ? previous : merged;
};

// Keeps the interactive heatmap's prices up to date while the tab is visible, and says when refreshing fails
// With `stream` on (during the regular session), the largest stocks also move with every trade, through
// /api/heatmap/stream, while the once-a-minute refresh keeps the rest current.
export const useHeatmapFeed = (initial: HeatmapPayload, { stream = false }: { stream?: boolean } = {}): HeatmapFeed => {
    const [feed, setFeed] = useState<HeatmapFeed>(() => ({ ...initial, lastSuccessAt: initial.generatedAt, live: OFF }));
    const [initialAt] = useState(initial.generatedAt);

    useEffect(() => {
        if (!stream) return;
        let source: EventSource | null = null;
        let timer = 0;
        let stopped = false;
        // After the stream fails, the next try waits longer each time (30 s, 1, 2, then 5 minutes)
        let retryDelay = STREAM_RETRY_MS;

        const setLive = (live: LiveStream) => setFeed((previous) => ({ ...previous, live }));
        const close = () => {
            source?.close();
            source = null;
            window.clearTimeout(timer);
        };
        const retryLater = (reason?: string) => {
            close();
            setLive({ state: "off", symbols: [], reason });
            if (stopped || reason === "not-configured" || reason === "unsupported") return;
            timer = window.setTimeout(open, retryDelay);
            retryDelay = Math.min(retryDelay * 2, MAX_BACKOFF_MS);
        };

        function open() {
            close();
            if (stopped || document.visibilityState !== "visible") return;
            setLive({ state: "connecting", symbols: [] });
            const next = new EventSource("/api/heatmap/stream");
            source = next;
            next.addEventListener("live", (event) => {
                retryDelay = STREAM_RETRY_MS;
                const { symbols } = JSON.parse((event as MessageEvent).data) as { symbols: string[] };
                setLive({ state: "live", symbols });
            });
            next.addEventListener("trades", (event) => {
                const trades = JSON.parse((event as MessageEvent).data) as LiveTrade[];
                const receivedAt = Date.now();
                setFeed((previous) => {
                    const stocks = applyLiveTrades(previous.stocks, trades, receivedAt);
                    return stocks === previous.stocks ? previous : { ...previous, stocks };
                });
            });
            // The server ends each connection after a few minutes; the next one opens straight away
            next.addEventListener("reconnect", () => open());
            next.addEventListener("closed", (event) => {
                const { reason } = JSON.parse((event as MessageEvent).data) as { reason?: string };
                retryLater(reason);
            });
            // A dropped connection, or an answer that isn't a stream (signed out, server error)
            next.onerror = () => {
                if (source === next) retryLater("dropped");
            };
        }

        // A hidden tab lets the stream go, and opens it again when shown
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                if (!source) open();
            } else {
                close();
                setLive({ state: "off", symbols: [] });
            }
        };

        open();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            stopped = true;
            close();
            document.removeEventListener("visibilitychange", onVisibilityChange);
            setLive(OFF);
        };
    }, [stream]);

    useEffect(() => {
        // The first prices can be older than this page view (going Back shows the page as it was), so the first
        // refresh comes a minute after they were made, which is straight away when they're already a minute old
        let lastRefresh = Math.min(initialAt, Date.now());
        let inFlight: AbortController | null = null;
        let stopped = false;
        let timer = 0;
        // After a failed refresh the next try waits twice as long (1, 2, 4, then 5 minutes), so a provider outage
        // or rate limit isn't hit again every minute; the first success goes back to every minute
        let delay = REFRESH_MS;

        const schedule = (wait = delay) => {
            window.clearTimeout(timer);
            if (!stopped) timer = window.setTimeout(refresh, wait);
        };

        const fail = (refreshError: RefreshError) => {
            delay = Math.min(delay * 2, MAX_BACKOFF_MS);
            setFeed((previous) => ({ ...previous, refreshError, failingSince: previous.failingSince ?? Date.now() }));
        };

        async function refresh() {
            if (stopped || inFlight) return;
            // A hidden tab doesn't ask; it catches up when shown again
            if (document.visibilityState !== "visible") return schedule();
            lastRefresh = Date.now();
            inFlight = new AbortController();
            try {
                const response = await fetch("/api/heatmap", { cache: "no-store", signal: inFlight.signal });
                if (response.status === 401) {
                    // Signed out in another tab, or the session ran out: stop asking and say so
                    stopped = true;
                    fail("signed-out");
                    return;
                }
                if (!response.ok) {
                    fail("server");
                    return;
                }
                const payload = (await response.json()) as HeatmapPayload;
                delay = REFRESH_MS;
                setFeed((previous) => ({
                    ...payload,
                    live: previous.live,
                    stocks: mergeHeatmapStocks(previous.stocks, payload.stocks),
                    lastSuccessAt: payload.generatedAt,
                    refreshError: undefined,
                    failingSince: undefined,
                }));
            } catch (e) {
                if ((e as Error).name !== "AbortError") fail("network");
            } finally {
                inFlight = null;
                schedule();
            }
        }

        // Catch up straight away when coming back to a tab that sat in the background
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible" && Date.now() - lastRefresh >= delay) refresh();
        };

        schedule(Math.max(0, REFRESH_MS - (Date.now() - lastRefresh)));
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            stopped = true;
            inFlight?.abort();
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [initialAt]);

    return feed;
};

// The current time, updated every half minute so freshness labels age while the page sits open.
// Starts at the server's time so the first render matches the server's HTML.
export const useNow = (start: number, everyMs = 30_000) => {
    const [now, setNow] = useState(start);
    useEffect(() => {
        const tick = () => setNow(Date.now());
        const first = window.setTimeout(tick, 0);
        const timer = window.setInterval(tick, everyMs);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, [everyMs]);
    return now;
};
