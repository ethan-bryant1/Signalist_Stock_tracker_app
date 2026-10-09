import TradingViewWidget from "@/components/TradingViewWidget";
import BackToDashboard from "@/components/BackToDashboard";
import { TOP_STORIES_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";

export default function TopStoriesPage() {
    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <TradingViewWidget
                title="Top Stories"
                scriptUrl={`${TRADINGVIEW_SCRIPT_URL}timeline.js`}
                config={TOP_STORIES_PAGE_WIDGET_CONFIG}
                height={800}
            />
        </div>
    );
}
