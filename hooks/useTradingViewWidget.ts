'use client';
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentTheme } from "@/hooks/useTheme";

// Background used by the widgets in light mode (matches --color-gray-800 in globals.css)
const LIGHT_BACKGROUND = '#F4F4F5';
// Chart line color in light mode (matches --color-gray-100 in globals.css)
const LIGHT_LINE = '#0A0A0A';

// TradingView's attribution line, as its embed code has it. Its widget terms require it under every widget,
// kept as TradingView designed it (its script styles it), so it isn't restyled to match the app.
export const TRADINGVIEW_ATTRIBUTION_HEIGHT = 32;
const ATTRIBUTION =
    '<div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div>';

// A widget whose script hasn't loaded by then is reported as failed, so the page can say so and offer a retry
const LOAD_TIMEOUT_MS = 20_000;

export type WidgetStatus = 'loading' | 'ready' | 'failed';

// Adjusts a widget config for the current theme, and points TradingView's
// "open symbol" links at our own /stocks page instead of tradingview.com
const prepareConfig = (scriptUrl: string, config: Record<string, unknown>): Record<string, unknown> => {
    const theme = getCurrentTheme();
    const result: Record<string, unknown> = { ...config };

    if ('colorTheme' in result) result.colorTheme = theme;
    if ('theme' in result) result.theme = theme;

    if (theme === 'light') {
        if ('backgroundColor' in result) result.backgroundColor = LIGHT_BACKGROUND;
        if ('gridColor' in result) result.gridColor = LIGHT_BACKGROUND;
        if ('scaleFontColor' in result) result.scaleFontColor = '#27272A';

        // The Market Overview line is white in dark mode, so draw it black on the light background
        if ('plotLineColorGrowing' in result) {
            result.plotLineColorGrowing = LIGHT_LINE;
            result.plotLineColorFalling = LIGHT_LINE;
            result.belowLineFillColorGrowing = 'rgba(10, 10, 10, 0.12)';
            result.belowLineFillColorFalling = 'rgba(10, 10, 10, 0.12)';
            result.belowLineFillColorGrowingBottom = 'rgba(10, 10, 10, 0)';
            result.belowLineFillColorFallingBottom = 'rgba(10, 10, 10, 0)';
            result.symbolActiveColor = 'rgba(10, 10, 10, 0.05)';
        }
    }

    // TradingView adds ?tvwidgetsymbol=EXCHANGE:SYMBOL to these links; app/(root)/stocks/page.tsx handles it
    const stockPageUrl = `${window.location.origin}/stocks`;
    // Every embed widget except the advanced chart supports largeChartUrl, so set it even when the config leaves it out
    if (!scriptUrl.includes('advanced-chart')) result.largeChartUrl = stockPageUrl;
    if ('symbolUrl' in result) result.symbolUrl = stockPageUrl;

    return result;
};

// Loads a TradingView embed widget into the returned container, with TradingView's attribution under it.
// `height` is the widget's own height in pixels, or 'fill' to fill the container (minus the attribution line).
// Reports whether the script loaded, and can try again.
const useTradingViewWidget = (scriptUrl: string, config: Record<string, unknown>, height: number | 'fill' = 600) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Bumped when the theme changes so the widget reloads in the new colors
    const [themeVersion, setThemeVersion] = useState(0);
    const [attempt, setAttempt] = useState(0);
    // The outcome of each load, keyed by what was loaded, so a new load reads as loading until it reports
    const [result, setResult] = useState<{ key: string; status: WidgetStatus } | null>(null);
    const loadKey = `${scriptUrl}|${height}|${themeVersion}|${attempt}|${JSON.stringify(config)}`;

    useEffect(() => {
        const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (container.dataset.loaded) return;
        const widgetHeight = height === 'fill' ? `calc(100% - ${TRADINGVIEW_ATTRIBUTION_HEIGHT}px)` : `${height}px`;
        container.innerHTML = `<div class="tradingview-widget-container__widget" style="width: 100%; height: ${widgetHeight};"></div>${ATTRIBUTION}`;

        // The script's load or error is final. The timeout isn't: a script that still loads after it replaces
        // the failure with ready, so a slow connection doesn't leave a working widget behind the failure message.
        let finished = false;
        const finish = (status: WidgetStatus) => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            setResult({ key: loadKey, status });
        };

        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.innerHTML = JSON.stringify(prepareConfig(scriptUrl, config));
        // The script draws the widget into an iframe as it runs, so one should be there once it has loaded
        script.onload = () => finish(container.querySelector('iframe') ? 'ready' : 'failed');
        script.onerror = () => finish('failed');
        const timer = window.setTimeout(() => setResult({ key: loadKey, status: 'failed' }), LOAD_TIMEOUT_MS);

        container.appendChild(script);
        container.dataset.loaded = 'true';

        return () => {
            finished = true;
            window.clearTimeout(timer);
            container.innerHTML = '';
            delete container.dataset.loaded;
        };
        // loadKey stands for scriptUrl, config, height, the theme and the attempt
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadKey]);

    const retry = useCallback(() => setAttempt((value) => value + 1), []);
    const status: WidgetStatus = result?.key === loadKey ? result.status : 'loading';

    return { containerRef, status, retry };
};

export default useTradingViewWidget;
