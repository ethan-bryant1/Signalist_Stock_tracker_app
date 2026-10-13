'use client';

import { useMemo } from "react";
import { WidgetFailed } from "@/components/TradingViewWidget";
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import { HEATMAP_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { TRADINGVIEW_COLOR, TRADINGVIEW_GROUP, TRADINGVIEW_SIZE, type ColorBy, type GroupBy, type SizeBy } from "@/lib/heatmap-state";
import { cn } from "@/lib/utils";

type HeatmapTerminalProps = {
    color: ColorBy;
    size: SizeBy;
    group: GroupBy;
    // TradingView's own bar above the map, which can switch it to another index such as the Nasdaq 100
    showMapControls: boolean;
    className?: string;
};

// TradingView's S&P 500 heatmap, set from the Heatmap page's toolbar. It's a sealed frame from TradingView's site:
// its data, calculations, hover card and sectors (FactSet's, not GICS) are TradingView's, and the page can't
// react to anything inside it, so selecting stocks and focusing sectors happen in the interactive view instead.
const HeatmapTerminal = ({ color, size, group, showMapControls, className }: HeatmapTerminalProps) => {
    // Rebuilt only when a setting changes, since every new config reloads the map
    const config = useMemo(
        () => ({
            ...HEATMAP_PAGE_WIDGET_CONFIG,
            blockColor: TRADINGVIEW_COLOR[color] ?? TRADINGVIEW_COLOR["1d"],
            blockSize: TRADINGVIEW_SIZE[size].blockSize,
            isMonoSize: TRADINGVIEW_SIZE[size].isMonoSize,
            grouping: TRADINGVIEW_GROUP[group],
            hasTopBar: showMapControls,
            isDataSetEnabled: showMapControls,
        }),
        [color, size, group, showMapControls]
    );

    const { containerRef, status, retry } = useTradingViewWidget(`${TRADINGVIEW_SCRIPT_URL}stock-heatmap.js`, config, "fill");

    return (
        <div className={cn("relative", className)}>
            <div ref={containerRef} className="tradingview-widget-container tradingview-widget-container--fill h-full rounded-none!" />
            {status === "loading" && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-8 animate-pulse bg-gray-700/30 motion-reduce:animate-none" />}
            {status === "failed" && <WidgetFailed name="heatmap" onRetry={retry} />}
        </div>
    );
};

export default HeatmapTerminal;
