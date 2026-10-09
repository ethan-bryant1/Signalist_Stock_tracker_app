import TradingViewWidget from "@/components/TradingViewWidget";
import BackToDashboard from "@/components/BackToDashboard";
import { HEATMAP_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";

export default function HeatmapPage() {
    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <TradingViewWidget
                title="Stock Heatmap"
                scriptUrl={`${TRADINGVIEW_SCRIPT_URL}stock-heatmap.js`}
                config={HEATMAP_PAGE_WIDGET_CONFIG}
                height={800}
            />
        </div>
    );
}
