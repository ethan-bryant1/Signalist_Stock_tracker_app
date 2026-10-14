'use client';

import PriceChart from "@/components/chart/PriceChart";
import Panel from "@/components/Panel";
import TradingViewWidget from "@/components/TradingViewWidget";
import { FullscreenButton, ToolButton } from "@/components/ToolButton";
import { useChartSettings } from "@/hooks/useChartSettings";
import { useFullscreen } from "@/hooks/useFullscreen";
import { CANDLE_CHART_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

// The stock's chart in a panel that can go full screen, with two sources to switch between (remembered in this
// browser, TradingView by default):
// - TradingView's official Advanced Chart embed, with its own data feed (often delayed), timeframes, indicators and
//   drawing tools; it costs no Finnhub requests. The embed has no documented way for the page to save drawings or
//   indicators, so a reload starts fresh.
// - Our daily chart (components/chart/PriceChart.tsx) on Alpaca's adjusted daily bars, loaded only when chosen.
const StockChartPanel = ({ symbol }: { symbol: string }) => {
    const { ref, canFullscreen, isFullscreen, toggle } = useFullscreen();
    const [settings, updateSettings] = useChartSettings();
    const daily = settings.source === "daily";

    return (
        <div ref={ref} className={cn("min-w-0", isFullscreen && "flex h-screen w-screen flex-col bg-gray-900 p-3")}>
            <Panel
                title="Chart"
                description={daily ? "Daily bars · Alpaca, adjusted" : "TradingView · its own feed, which may be delayed"}
                actions={
                    <>
                        <div role="group" aria-label="Chart source" className="flex gap-1">
                            <ToolButton title="TradingView chart (intraday, indicators, drawing tools)" pressed={!daily} onClick={() => updateSettings({ source: "tradingview" })} className="px-2.5">
                                TradingView
                            </ToolButton>
                            <ToolButton title="Daily chart on Alpaca prices" pressed={daily} onClick={() => updateSettings({ source: "daily" })} className="px-2.5">
                                Daily
                            </ToolButton>
                        </div>
                        <FullscreenButton canFullscreen={canFullscreen} isFullscreen={isFullscreen} onToggle={toggle} />
                    </>
                }
                className={cn(isFullscreen && "min-h-0 flex-1")}
            >
                <div className={cn(isFullscreen ? "h-full" : "h-[452px] sm:h-[592px]")}>
                    {daily ? (
                        <PriceChart symbol={symbol} settings={settings} onChange={updateSettings} />
                    ) : (
                        <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}advanced-chart.js`} config={CANDLE_CHART_WIDGET_CONFIG(symbol)} height="fill" className="rounded-none!" />
                    )}
                </div>
            </Panel>
        </div>
    );
};

export default StockChartPanel;
