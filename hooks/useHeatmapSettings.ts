'use client';

import { useCallback, useSyncExternalStore } from "react";
import type { HeatPalette } from "@/lib/heatmap";

// The viewer's heatmap display settings, remembered in this browser (they change how the map looks, not the data)
export type HeatmapSettings = { palette: HeatPalette; logos: boolean };

const KEY = "heatmap-settings";
const DEFAULTS: HeatmapSettings = { palette: "classic", logos: true };
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: HeatmapSettings } | null = null;

const read = (): HeatmapSettings => {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(KEY);
    } catch {
        // Storage can be blocked (private windows, strict settings); the defaults still work
    }
    if (cached && cached.raw === raw) return cached.value;
    let value = DEFAULTS;
    try {
        const parsed = raw ? JSON.parse(raw) : null;
        value = {
            palette: parsed?.palette === "cvd" ? "cvd" : "classic",
            logos: parsed?.logos !== false,
        };
    } catch {
        value = DEFAULTS;
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

export const useHeatmapSettings = () => {
    const settings = useSyncExternalStore(subscribe, read, () => DEFAULTS);
    const update = useCallback((change: Partial<HeatmapSettings>) => {
        try {
            localStorage.setItem(KEY, JSON.stringify({ ...read(), ...change }));
        } catch {
            // Not saved, but nothing else breaks
        }
        listeners.forEach((listener) => listener());
    }, []);
    return [settings, update] as const;
};
