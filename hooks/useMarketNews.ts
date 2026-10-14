"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NewsResult } from "@/lib/news-data";

// Finnhub's market and M&A headlines for the Dashboard and workspace widgets, from the same server copy the News page
// uses (/api/news?feed=market, reused 10 minutes for everyone). Asks again every 15 minutes only while the tab is
// visible, and once a few seconds after showing a copy the server was refreshing. A failed refresh keeps what's shown.
const REFRESH_MS = 15 * 60_000;
const STALE_FOLLOW_UP_MS = 5000;

export type MarketNewsState = { result: NewsResult | null; failed: boolean; loading: boolean };

export function useMarketNews(initial: NewsResult | null): MarketNewsState {
    const [result, setResult] = useState<NewsResult | null>(initial);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(initial === null);
    const lastLoad = useRef(0);

    const load = useCallback(async () => {
        lastLoad.current = Date.now();
        setLoading(true);
        try {
            const response = await fetch("/api/news?feed=market", { cache: "no-store" });
            if (!response.ok) throw new Error("failed");
            const next = (await response.json()) as NewsResult;
            setResult((previous) => (next.items.length > 0 || !previous || previous.items.length === 0 ? next : { ...previous, issue: next.issue ?? "provider" }));
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    // First load when the server didn't send headlines, or a follow-up when it sent a copy it was refreshing
    useEffect(() => {
        if (initial === null) {
            const timer = window.setTimeout(() => void load(), 0);
            return () => window.clearTimeout(timer);
        }
        if (initial.stale && !initial.issue) {
            const timer = window.setTimeout(() => void load(), STALE_FOLLOW_UP_MS);
            return () => window.clearTimeout(timer);
        }
    }, [initial, load]);

    useEffect(() => {
        lastLoad.current ||= Date.now();
        const tick = () => {
            if (document.visibilityState === "visible" && Date.now() - lastLoad.current >= REFRESH_MS - 1000) void load();
        };
        const timer = window.setInterval(tick, REFRESH_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [load]);

    return { result, failed, loading };
}
