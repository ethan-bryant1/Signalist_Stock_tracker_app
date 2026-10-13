'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MarketSnapshot } from "@/lib/stock-data";

// How often prices refresh. The server reuses each price for a minute, within Finnhub's free-plan budget.
const REFRESH_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export type LiveMarket = MarketSnapshot & {
    // Set while refreshing keeps failing: the prices shown are from the last answer that arrived
    refreshFailing?: boolean;
};

type LiveMarketContextValue = {
    market: LiveMarket;
    // A page that shows the sector funds asks the one poller to include them while it's open
    requestSectors: () => () => void;
};

const LiveMarketContext = createContext<LiveMarketContextValue | null>(null);

// Keeps the market figures on the page up to date while the tab is open. There is one of these, in the layout;
// pages that need the sector funds too add <IncludeSectorPrices>. A price that fails to refresh keeps its last
// value, and the strip says the prices are old instead of going blank.
export const LiveMarketProvider = ({ initial, children }: { initial: MarketSnapshot; children: React.ReactNode }) => {
    const [market, setMarket] = useState<LiveMarket>(initial);
    const [sectorPages, setSectorPages] = useState(0);
    const includeSectors = sectorPages > 0;

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        let lastRefresh = Date.now();
        let inFlight: AbortController | null = null;
        // After a failed refresh the next try waits twice as long (1, 2, 4, then 5 minutes)
        let delay = REFRESH_MS;

        const schedule = (wait = delay) => {
            window.clearTimeout(timer);
            if (!stopped) timer = window.setTimeout(refresh, wait);
        };

        async function refresh() {
            if (stopped || inFlight) return;
            // A hidden tab doesn't ask; it catches up when shown again
            if (document.visibilityState !== "visible") return schedule();
            lastRefresh = Date.now();
            inFlight = new AbortController();
            try {
                const response = await fetch(`/api/market${includeSectors ? "?sectors=1" : ""}`, { signal: inFlight.signal });
                if (response.status === 401) {
                    stopped = true;
                    setMarket((previous) => ({ ...previous, refreshFailing: true }));
                    return;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const next = (await response.json()) as MarketSnapshot;
                delay = REFRESH_MS;
                setMarket((previous) => ({
                    ...next,
                    quotes: { ...previous.quotes, ...next.quotes },
                    asOf: next.asOf ?? previous.asOf,
                    refreshFailing: false,
                }));
            } catch (e) {
                if ((e as Error).name === "AbortError") return;
                delay = Math.min(delay * 2, MAX_BACKOFF_MS);
                setMarket((previous) => ({ ...previous, refreshFailing: true }));
            } finally {
                inFlight = null;
                schedule();
            }
        }

        // Catch up straight away when coming back to a tab that sat in the background
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible" && Date.now() - lastRefresh >= delay) refresh();
        };

        schedule();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            stopped = true;
            inFlight?.abort();
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [includeSectors]);

    const requestSectors = useCallback(() => {
        setSectorPages((count) => count + 1);
        return () => setSectorPages((count) => count - 1);
    }, [setSectorPages]);
    const value = useMemo<LiveMarketContextValue>(() => ({ market, requestSectors }), [market, requestSectors]);

    return <LiveMarketContext.Provider value={value}>{children}</LiveMarketContext.Provider>;
};

// For pages that show sector performance: the layout's poller includes the sector funds while this is mounted,
// and the page's own first prices fill in until the poller's next answer brings them
export const IncludeSectorPrices = ({ initial, children }: { initial: MarketSnapshot; children: React.ReactNode }) => {
    const parent = useContext(LiveMarketContext);
    if (!parent) throw new Error("IncludeSectorPrices must be used inside LiveMarketProvider");
    const { market, requestSectors } = parent;

    useEffect(() => requestSectors(), [requestSectors]);

    const value = useMemo<LiveMarketContextValue>(
        () => ({ market: { ...market, quotes: { ...initial.quotes, ...market.quotes } }, requestSectors }),
        [market, initial.quotes, requestSectors]
    );

    return <LiveMarketContext.Provider value={value}>{children}</LiveMarketContext.Provider>;
};

export const useLiveMarket = (): LiveMarket => {
    const value = useContext(LiveMarketContext);
    if (!value) throw new Error("useLiveMarket must be used inside LiveMarketProvider");
    return value.market;
};
