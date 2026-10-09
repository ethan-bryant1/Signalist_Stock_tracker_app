import { headers } from "next/headers";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import IndexTiles from "@/components/IndexTiles";
import MarketStatusBadge from "@/components/MarketStatusBadge";
import { LiveMarketProvider } from "@/components/LiveMarket";
import { getAuth } from "@/lib/better-auth/auth";
import { getMarketSnapshot } from "@/lib/actions/finnhub.actions";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG,
    TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";

// Each panel's "Open" link shows that widget on its own, larger page
const Home = async () => {
    const auth = await getAuth();
    const [session, snapshot] = await Promise.all([
        auth.api.getSession({ headers: await headers() }),
        getMarketSnapshot(),
    ]);
    const firstName = session?.user.name?.trim().split(/\s+/)[0];
    // The market's date, which is what matters for prices
    const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "America/New_York",
    });

    return (
        <LiveMarketProvider initial={snapshot}>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-500">{today}</p>
                        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">
                            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                        </h1>
                    </div>
                    <MarketStatusBadge />
                </div>

                <IndexTiles />

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Panel title="Market overview" description="Top stocks by sector over the past 12 months" href="/market-overview">
                        <TradingViewWidget
                            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-overview.js`}
                            config={MARKET_OVERVIEW_WIDGET_CONFIG}
                            height={600}
                        />
                    </Panel>
                    <Panel title="Stock heatmap" description="S&P 500 by market cap, colored by today's move" href="/heatmap" className="xl:col-span-2">
                        <TradingViewWidget
                            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}stock-heatmap.js`}
                            config={HEATMAP_WIDGET_CONFIG}
                            height={600}
                        />
                    </Panel>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Panel title="Top stories" description="The latest market headlines" href="/top-stories">
                        <TradingViewWidget
                            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}timeline.js`}
                            config={TOP_STORIES_WIDGET_CONFIG}
                            height={600}
                        />
                    </Panel>
                    <Panel title="Market data" description="Live quotes for popular stocks" href="/market-data" className="xl:col-span-2">
                        <TradingViewWidget
                            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-quotes.js`}
                            config={MARKET_DATA_WIDGET_CONFIG}
                            height={600}
                        />
                    </Panel>
                </div>
            </div>
        </LiveMarketProvider>
    );
};

export default Home;
