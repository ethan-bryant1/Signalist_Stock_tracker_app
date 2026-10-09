'use client';

import { createContext, useContext, useEffect, useState } from "react";
import { getMarketSnapshot, type MarketSnapshot } from "@/lib/actions/finnhub.actions";

// How often prices refresh. Finnhub's free plan allows 60 requests a minute, and answers are cached for a minute.
const REFRESH_MS = 60_000;

const LiveMarketContext = createContext<MarketSnapshot | null>(null);

// Keeps the market figures on the page up to date while the tab is open.
// A price that fails to refresh keeps its last value instead of going blank.
export const LiveMarketProvider = ({
    initial,
    includeSectors = false,
    children,
}: {
    initial: MarketSnapshot;
    includeSectors?: boolean;
    children: React.ReactNode;
}) => {
    const [snapshot, setSnapshot] = useState(initial);

    useEffect(() => {
        let cancelled = false;
        let lastRefresh = Date.now();

        const refresh = async () => {
            if (document.visibilityState !== "visible") return;
            lastRefresh = Date.now();
            try {
                const next = await getMarketSnapshot(includeSectors);
                if (cancelled) return;
                setSnapshot((previous) => ({
                    ...next,
                    quotes: { ...previous.quotes, ...next.quotes },
                    asOf: next.asOf ?? previous.asOf,
                }));
            } catch (e) {
                console.error("Couldn't refresh market prices", e);
            }
        };

        // Catch up straight away when coming back to a tab that sat in the background
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible" && Date.now() - lastRefresh >= REFRESH_MS) refresh();
        };

        const timer = window.setInterval(refresh, REFRESH_MS);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [includeSectors]);

    return <LiveMarketContext.Provider value={snapshot}>{children}</LiveMarketContext.Provider>;
};

export const useLiveMarket = () => {
    const snapshot = useContext(LiveMarketContext);
    if (!snapshot) throw new Error("useLiveMarket must be used inside LiveMarketProvider");
    return snapshot;
};
