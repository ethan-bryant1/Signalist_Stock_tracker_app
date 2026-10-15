"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keepFailedSources, type EventsResult } from "@/lib/events";

// The Fed and economic-data schedules for the workspace's Upcoming events widget, from the same server copy the News
// page uses (/api/news?feed=events; the agencies are asked at most every 6 hours, never Finnhub). Asks again every
// 15 minutes only while the tab is visible, which picks up a recovered source or a new day. A failed answer keeps
// what's shown.
const REFRESH_MS = 15 * 60_000;

export type UpcomingEventsState = { result: EventsResult | null; failed: boolean; loading: boolean; reload: () => void };

export function useUpcomingEvents(): UpcomingEventsState {
    const [result, setResult] = useState<EventsResult | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const lastLoad = useRef(0);

    const load = useCallback(async () => {
        lastLoad.current = Date.now();
        setLoading(true);
        try {
            const response = await fetch("/api/news?feed=events", { cache: "no-store" });
            if (!response.ok) throw new Error("failed");
            const next = (await response.json()) as EventsResult;
            setResult((previous) => (previous ? keepFailedSources(previous, next) : next));
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const first = window.setTimeout(() => void load(), 0);
        const tick = () => {
            if (document.visibilityState === "visible" && Date.now() - lastLoad.current >= REFRESH_MS - 1000) void load();
        };
        const timer = window.setInterval(tick, REFRESH_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [load]);

    return { result, failed, loading, reload: () => void load() };
}
