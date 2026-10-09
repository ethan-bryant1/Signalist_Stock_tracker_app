import TradingViewWidget from "@/components/TradingViewWidget";
import BackToDashboard from "@/components/BackToDashboard";
import { MARKET_DATA_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";

export default function MarketDataPage() {
    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <TradingViewWidget
                title="Market Data"
                scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-quotes.js`}
                config={MARKET_DATA_PAGE_WIDGET_CONFIG}
                height={800}
            />
        </div>
    );
}
