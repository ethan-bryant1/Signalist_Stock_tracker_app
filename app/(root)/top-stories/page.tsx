import type { Metadata } from "next";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import PageHeader from "@/components/PageHeader";
import { ECONOMIC_CALENDAR_WIDGET_CONFIG, TOP_STORIES_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";

export const metadata: Metadata = { title: "News · Loops Watch" };

// Market headlines beside the week's US economic releases, both TradingView embeds (no Finnhub requests)
export default function TopStoriesPage() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title="News" description="The latest market headlines, and the US economic releases that move the market. From TradingView." />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel title="Top stories" description="Market headlines" className="xl:col-span-2">
                    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}timeline.js`} config={TOP_STORIES_PAGE_WIDGET_CONFIG} height={800} />
                </Panel>
                <Panel title="Economic calendar" description="US releases of medium and high importance">
                    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}events.js`} config={ECONOMIC_CALENDAR_WIDGET_CONFIG} height={800} />
                </Panel>
            </div>
        </div>
    );
}
