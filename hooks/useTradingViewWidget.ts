'use client';
import { useEffect, useRef, useState } from "react";
import { getCurrentTheme } from "@/hooks/useTheme";

// Background used by the widgets in light mode (matches --color-gray-800 in globals.css)
const LIGHT_BACKGROUND = '#F4F4F5';

// Adjusts a widget config for the current theme, and points TradingView's
// "open symbol" links at our own /stocks page instead of tradingview.com
const prepareConfig = (config: Record<string, unknown>): Record<string, unknown> => {
    const theme = getCurrentTheme();
    const result: Record<string, unknown> = { ...config };

    if ('colorTheme' in result) result.colorTheme = theme;
    if ('theme' in result) result.theme = theme;

    if (theme === 'light') {
        if ('backgroundColor' in result) result.backgroundColor = LIGHT_BACKGROUND;
        if ('gridColor' in result) result.gridColor = LIGHT_BACKGROUND;
        if ('scaleFontColor' in result) result.scaleFontColor = '#27272A';
    }

    // TradingView adds ?tvwidgetsymbol=EXCHANGE:SYMBOL to these links; app/(root)/stocks/page.tsx handles it
    const stockPageUrl = `${window.location.origin}/stocks`;
    if ('largeChartUrl' in result) result.largeChartUrl = stockPageUrl;
    if ('symbolUrl' in result) result.symbolUrl = stockPageUrl;

    return result;
};

const useTradingViewWidget = (scriptUrl: string, config: Record<string, unknown>, height = 600) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Bumped when the theme changes so the widget reloads in the new colors
    const [themeVersion, setThemeVersion] = useState(0);

    useEffect(() => {
        const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (container.dataset.loaded) return;
        container.innerHTML = `<div class="tradingview-widget-container__widget" style="width: 100%; height: ${height}px;"></div>`;

        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.innerHTML = JSON.stringify(prepareConfig(config));

        container.appendChild(script);
        container.dataset.loaded = 'true';

        return () => {
            container.innerHTML = '';
            delete container.dataset.loaded;
        }
    }, [scriptUrl, config, height, themeVersion])

    return containerRef;
}

export default useTradingViewWidget;
