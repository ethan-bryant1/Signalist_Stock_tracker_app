"use client";

import { useMemo } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import { MARKET_DATA_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import type { TvScreen, TvView } from "@/lib/screener";

// TradingView's screener of every US-listed stock, opened on one of its preset screens and column views. Those two
// are the only settings it takes from us; its own toolbar (filters, sorting, more columns) works inside its frame and
// isn't readable or saved by Loops Watch. A changed screen or view reloads the embed. Clicking a stock opens our
// stock page (largeChartUrl, set by useTradingViewWidget).
const TvScreener = ({ screen, view, height = "fill", className }: { screen: TvScreen; view: TvView; height?: number | "fill"; className?: string }) => {
    const config = useMemo(() => ({ ...MARKET_DATA_PAGE_WIDGET_CONFIG, defaultScreen: screen, defaultColumn: view }), [screen, view]);
    return <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}screener.js`} config={config} height={height} className={className} />;
};

export default TvScreener;
