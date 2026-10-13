'use client';

import Panel from "@/components/Panel";
import TradingViewWidget from "@/components/TradingViewWidget";
import { FullscreenButton } from "@/components/ToolButton";
import { useFullscreen } from "@/hooks/useFullscreen";
import { CANDLE_CHART_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

// The stock's TradingView Advanced Chart in a panel that can go full screen. The chart is TradingView's official
// embed with its own data feed (often delayed), timeframes, indicators and drawing tools; it costs no Finnhub
// requests. The embed has no documented way for the page to save drawings or indicators, so a reload starts fresh.
const StockChartPanel = ({ symbol }: { symbol: string }) => {
    const { ref, canFullscreen, isFullscreen, toggle } = useFullscreen();

    return (
        <div ref={ref} className={cn("min-w-0", isFullscreen && "flex h-screen w-screen flex-col bg-gray-900 p-3")}>
            <Panel
                title="Chart"
                description="TradingView · its own feed, which may be delayed"
                actions={<FullscreenButton canFullscreen={canFullscreen} isFullscreen={isFullscreen} onToggle={toggle} />}
                className={cn(isFullscreen && "min-h-0 flex-1")}
            >
                <div className={cn(isFullscreen ? "h-full" : "h-[452px] sm:h-[592px]")}>
                    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}advanced-chart.js`} config={CANDLE_CHART_WIDGET_CONFIG(symbol)} height="fill" className="rounded-none!" />
                </div>
            </Panel>
        </div>
    );
};

export default StockChartPanel;
