import TradingViewWidget from "@/components/TradingViewWidget";
import BackToDashboard from "@/components/BackToDashboard";
import {
    MARKET_CHART_WIDGET_CONFIG,
    MARKET_OVERVIEW_PAGE_WIDGET_CONFIG,
    TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";

export default function MarketOverviewPage() {
    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <section className="grid w-full grid-cols-1 gap-8 xl:grid-cols-3">
                <div className="xl:col-span-1">
                    <TradingViewWidget
                        title="Market Overview"
                        scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-overview.js`}
                        config={MARKET_OVERVIEW_PAGE_WIDGET_CONFIG}
                        className="custom-chart"
                        height={700}
                    />
                </div>
                <div className="xl:col-span-2">
                    {/* Use the chart type button in the chart's toolbar to switch between candles, bars, line and more */}
                    <TradingViewWidget
                        title="Chart"
                        scriptUrl={`${TRADINGVIEW_SCRIPT_URL}advanced-chart.js`}
                        config={MARKET_CHART_WIDGET_CONFIG}
                        className="custom-chart"
                        height={700}
                    />
                </div>
            </section>
        </div>
    );
}
