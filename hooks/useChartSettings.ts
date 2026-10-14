'use client';

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_CHART_SETTINGS, parseChartSettings, type ChartSettings } from "@/lib/price-chart";

// The stock page chart's source, range, style, moving averages and indicators, remembered in this browser (they change how the
// chart looks, not the data)
const KEY = "stock-chart-settings";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: ChartSettings } | null = null;

const read = (): ChartSettings => {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(KEY);
    } catch {
        // Storage can be blocked (private windows, strict settings); the defaults still work
    }
    if (cached && cached.raw === raw) return cached.value;
    let value = DEFAULT_CHART_SETTINGS;
    try {
        value = parseChartSettings(raw ? JSON.parse(raw) : null);
    } catch {
        value = DEFAULT_CHART_SETTINGS;
    }
    cached = { raw, value };
    return value;
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => event.key === KEY && listener();
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
};

export const useChartSettings = () => {
    const settings = useSyncExternalStore(subscribe, read, () => DEFAULT_CHART_SETTINGS);
    const update = useCallback((change: Partial<ChartSettings>) => {
        try {
            localStorage.setItem(KEY, JSON.stringify({ ...read(), ...change }));
        } catch {
            // Not saved, but nothing else breaks
        }
        listeners.forEach((listener) => listener());
    }, []);
    return [settings, update] as const;
};
