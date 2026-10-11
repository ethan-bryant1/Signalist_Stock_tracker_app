'use client';

import { useEffect, useState } from "react";
import type { HeatmapPayload, HeatmapStock } from "@/lib/market-data";

// The page asks for fresh prices every minute; the server caches each price for two to three minutes
const REFRESH_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export type RefreshError = "signed-out" | "network" | "server";

export type HeatmapFeed = HeatmapPayload & {
    // When the page last received prices (the server's time for its answer)
    lastSuccessAt: number;
    // Set while refreshing keeps failing, with when it started failing
    refreshError?: RefreshError;
    failingSince?: number;
};

const sameQuote = (a?: HeatmapStock["quote"], b?: HeatmapStock["quote"]) =>
    a === b || (!!a && !!b && a.price === b.price && a.time === b.time && a.previousClose === b.previousClose && a.dayHigh === b.dayHigh && a.dayLow === b.dayLow && a.open === b.open);

// Combines a refresh with what the page already shows. A stock whose quote didn't come back keeps its last quote
// as one unit, with that quote's own times, so it shows as stale instead of disappearing or mixing figures from
// two different moments. Unchanged stocks keep the same object, so their tiles don't redraw, and when nothing
// changed at all the previous list itself comes back, so nothing computed from it is redone.
export const mergeHeatmapStocks = (previous: HeatmapStock[], next: readonly HeatmapStock[]): HeatmapStock[] => {
    const before = new Map(previous.map((stock) => [stock.symbol, stock]));
    const merged = next.map((stock) => {
        const old = before.get(stock.symbol);
        if (!old) return stock;
        const merged: HeatmapStock = {
            ...stock,
            quote: stock.quote ?? old.quote,
            fetchedAt: stock.quote ? stock.fetchedAt : old.fetchedAt,
            marketCap: stock.marketCap ?? old.marketCap,
            logo: stock.logo ?? old.logo,
            exchange: stock.exchange ?? old.exchange,
        };
        const unchanged = sameQuote(merged.quote, old.quote) && merged.fetchedAt === old.fetchedAt && merged.marketCap === old.marketCap
            && merged.logo === old.logo && merged.exchange === old.exchange && merged.name === old.name;
        return unchanged ? old : merged;
    });
    return merged.length === previous.length && merged.every((stock, index) => stock === previous[index]) ? previous : merged;
};

// Keeps the interactive heatmap's prices up to date while the tab is visible, and says when refreshing fails
export const useHeatmapFeed = (initial: HeatmapPayload): HeatmapFeed => {
    const [feed, setFeed] = useState<HeatmapFeed>(() => ({ ...initial, lastSuccessAt: initial.generatedAt }));
    const [initialAt] = useState(initial.generatedAt);

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
