'use client';

import { useMemo } from "react";
import StockHeatmap, { sizeWhileLoading, sizingNote, unplacedStocks } from "@/components/StockHeatmap";
import HeatmapDisplaySettings from "@/components/HeatmapDisplaySettings";
import { HeatmapLegend, HeatmapStatus } from "@/components/HeatmapFooter";
import { useLiveMarket } from "@/components/LiveMarket";
import { useHeatmapFeed, useNow } from "@/hooks/useHeatmapFeed";
import { useHeatmapSettings } from "@/hooks/useHeatmapSettings";
import { HEATMAP_SYMBOLS, HEATMAP_UNIVERSE } from "@/lib/data/heatmap";
import { assessStocks, periodPhrase, type HeatmapPayload } from "@/lib/market-data";
import { cn } from "@/lib/utils";

// The dashboard's Market Snapshot: a quick read of the market. Hovering shows a stock's quote and clicking opens its
// page. The S&P 500 Heatmap page has TradingView's map
// of the whole index.
// In a workspace, onSelect makes a click load the stock into the linked widgets instead of opening its page.
const DashboardHeatmap = ({
    initial,
    className = "h-[632px]",
    selectedSymbol,
    onSelect,
}: {
    initial: HeatmapPayload;
    className?: string;
    selectedSymbol?: string;
    onSelect?: (symbol: string) => void;
}) => {
    const { session } = useLiveMarket();
    // Trades stream in only while the regular session trades; otherwise prices refresh once a minute
    const feed = useHeatmapFeed(initial, { stream: session === "regular" });
    const now = useNow(initial.generatedAt);
    const [settings] = useHeatmapSettings();

    const assessment = useMemo(() => assessStocks(feed.stocks, { now, session }), [feed.stocks, now, session]);
    const sizeBy = useMemo(() => sizeWhileLoading(feed.stocks, "cap"), [feed.stocks]);
    const unplaced = useMemo(() => unplacedStocks(feed.stocks, sizeBy), [feed.stocks, sizeBy]);

    return (
        // On the dashboard, as tall as the TradingView panel beside it (a 600px widget plus its 32px attribution line)
        <div data-heat-palette={settings.palette} className={cn("flex flex-col", className)}>
            <div className="relative min-h-0 flex-1">
                <StockHeatmap
                    stocks={feed.stocks}
                    freshness={assessment.freshness}
                    now={now}
                    sizeBy={sizeBy}
                    groupBy="sector"
                    action={onSelect ? "select" : "open"}
                    selectedSymbol={onSelect ? selectedSymbol : undefined}
                    onSelect={onSelect}
                    showLogos={settings.logos}
                    periodText={periodPhrase(assessment.period)}
                    label={`Heatmap of ${HEATMAP_SYMBOLS.length} ${HEATMAP_UNIVERSE.description}`}
                    emptyMessage={feed.issue === "not-configured" ? "Prices are unavailable: the server has no Finnhub API key." : undefined}
                    className="h-full"
                />
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 border-t border-gray-600 px-4 py-2 md:flex-row md:items-center md:justify-between md:gap-4">
                <HeatmapLegend palette={settings.palette} />
                <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
                    <HeatmapStatus feed={feed} assessment={assessment} stocks={feed.stocks} unplaced={unplaced} now={now} notes={sizeBy === "cap" ? [] : [sizingNote()]} className="md:justify-end md:text-right" />
                    {/* Colors for red-green color blindness, and logos on or off */}
                    <HeatmapDisplaySettings />
                </div>
            </div>
        </div>
    );
};

export default DashboardHeatmap;
