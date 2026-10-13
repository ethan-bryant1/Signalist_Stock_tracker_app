import type { Metadata } from "next";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import PageHeader from "@/components/PageHeader";
import { MARKET_CHART_WIDGET_CONFIG, MARKET_OVERVIEW_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";

export const metadata: Metadata = { title: "Market Overview · Loops Watch" };

// The dashboard's Market overview panel at full size, beside a chart that can show any symbol. Both are TradingView
// embeds with TradingView's own (often delayed) data and cost no Finnhub requests.
export default function MarketOverviewPage() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title="Market Overview" description="Leading stocks by sector over the past year, and a chart for any symbol. From TradingView, which may be delayed." />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel title="By sector" description="Top stocks over the past 12 months">
                    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-overview.js`} config={MARKET_OVERVIEW_PAGE_WIDGET_CONFIG} height={700} />
                </Panel>
                {/* The chart's toolbar switches symbol, interval and chart type (candles, bars, line and more) */}
                <Panel title="Chart" description="Pick any symbol in the chart's toolbar" className="xl:col-span-2">
                    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}advanced-chart.js`} config={MARKET_CHART_WIDGET_CONFIG} height={700} />
                </Panel>
            </div>
        </div>
    );
}
