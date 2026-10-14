import { Suspense } from "react";
import { headers } from "next/headers";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import IndexTiles from "@/components/IndexTiles";
import DashboardHeatmap from "@/components/DashboardHeatmap";
import DashboardNews from "@/components/news/DashboardNews";
import { getMarketNews } from "@/lib/news-data";
import { HEATMAP_SYMBOLS, HEATMAP_UNIVERSE } from "@/lib/data/heatmap";
import { getHeatmapData } from "@/lib/heatmap-data";
import { getSession } from "@/lib/better-auth/auth";
import {
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";

// Loads the heatmap's prices without holding up the rest of the dashboard
const HeatmapWithData = async () => <DashboardHeatmap initial={await getHeatmapData()} />;

// The newest market headlines from the News page's cached feed, without holding up the rest of the dashboard
const NewsWithData = async () => <DashboardNews initial={await getMarketNews()} />;

const NewsLoading = () => (
    <div aria-label="Loading headlines" role="status" className="flex flex-col divide-y divide-gray-600/70">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex flex-col gap-2 px-4 py-2.5">
                <div className="h-3 w-40 animate-pulse rounded bg-gray-700 motion-reduce:animate-none" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-gray-700 motion-reduce:animate-none" />
            </div>
        ))}
    </div>
);

// Each panel's "Open" link shows that widget on its own, larger page
const Home = async () => {
    const session = await getSession(await headers());
    const firstName = session?.user.name?.trim().split(/\s+/)[0];
    // The market's date, which is what matters for prices
    const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "America/New_York",
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">{today}</p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">
                    {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                </h1>
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
                <Panel
                    title="Market Snapshot"
                    description={`${HEATMAP_SYMBOLS.length} ${HEATMAP_UNIVERSE.description}, sized by market cap, colored by 1-day change`}
                    href="/heatmap"
                    linkLabel="Full S&P 500 map"
                    className="xl:col-span-2"
                >
                    {/* Only for a signed-in viewer: the layout's check renders alongside this page, and an empty price cache
                        costs over 100 Finnhub requests */}
                    {session?.user && (
                        <Suspense fallback={<div className="h-[632px] animate-pulse bg-gray-700/40 motion-reduce:animate-none" />}>
                            <HeatmapWithData />
                        </Suspense>
                    )}
                </Panel>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel title="Market news" description="Latest market and M&A headlines · Finnhub" href="/top-stories" linkLabel="View all news">
                    {session?.user && (
                        <Suspense fallback={<NewsLoading />}>
                            <NewsWithData />
                        </Suspense>
                    )}
                </Panel>
                <Panel title="Market data" description="Quotes for popular stocks · TradingView, may be delayed" href="/market-data" className="xl:col-span-2">
                    <TradingViewWidget
                        scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </Panel>
            </div>
        </div>
    );
};

export default Home;
