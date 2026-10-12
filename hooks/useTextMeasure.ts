'use client';

import { useEffect, useMemo, useState } from "react";
import { estimateTextWidth, type Measure } from "@/lib/heatmap";

// Measures text in the page's own font with a canvas, so tile labels are only shown when they fit in full.
// Digits are measured as zeros because the tiles use tabular (equal-width) figures.
// Measures again once the web font has loaded, since the fallback font has different widths.
export const useTextMeasure = (element: React.RefObject<HTMLElement | null>): Measure => {
    const [fontVersion, setFontVersion] = useState(0);
    const [family, setFamily] = useState<string | null>(null);

    useEffect(() => {
        const node = element.current;
        if (!node) return;
        let cancelled = false;
        const update = () => {
            if (!cancelled) {
                setFamily(getComputedStyle(node).fontFamily);
                setFontVersion((version) => version + 1);
            }
        };
        const first = window.setTimeout(update, 0);
        document.fonts?.ready.then(update).catch(() => {});
        return () => {
            cancelled = true;
            window.clearTimeout(first);
        };
    }, [element]);

    return useMemo<Measure>(() => {
        if (!family || typeof document === "undefined") return estimateTextWidth;
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return estimateTextWidth;
        const cache = new Map<string, number>();
        void fontVersion;
        return (text, fontSize, weight) => {
            const normalized = text.replace(/[0-9]/g, "0");
            const key = `${weight}|${fontSize}|${normalized}`;
            let width = cache.get(key);
            if (width === undefined) {
                context.font = `${weight} ${fontSize}px ${family}`;
                // A little extra so rounding in the browser's text layout never makes a label overflow
                width = context.measureText(normalized).width * 1.02 + 1;
                cache.set(key, width);
            }
            return width;
        };
    }, [family, fontVersion]);
};
