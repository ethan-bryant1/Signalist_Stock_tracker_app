import { Suspense } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import WatchlistButton from "@/components/WatchlistButton";
import CompanyNews from "@/components/CompanyNews";
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import { isStockInWatchlist } from "@/lib/actions/watchlist.actions";
import { getCompanyNews, getTradingViewSymbol } from "@/lib/actions/finnhub.actions";
import { formatTimeAgo } from "@/lib/utils";

// Loads the company's news separately, so the charts don't wait for it
async function NewsList({ symbol }: { symbol: string }) {
  const articles = await getCompanyNews(symbol);

  if (articles === null) {
    return <p className="text-gray-500">News couldn&apos;t load right now. Refresh the page to try again.</p>;
  }
  if (articles.length === 0) {
    return <p className="text-gray-500">No news about {symbol} in the past week.</p>;
  }

  return <CompanyNews articles={articles.map((article) => ({ ...article, timeAgo: formatTimeAgo(article.datetime) }))} />;
}

const NewsLoading = () => (
  <div className="flex flex-col gap-3" aria-label="Loading news">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-32 rounded-lg border border-gray-600 bg-gray-800 animate-pulse" />
    ))}
  </div>
);

export default async function StockDetails({ params }: StockDetailsPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const [isInWatchlist, tradingViewSymbol] = await Promise.all([
    isStockInWatchlist(symbol),
    getTradingViewSymbol(symbol),
  ]);
  const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

  return (
    <div className="flex min-h-screen p-4 md:p-6 lg:p-8">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <TradingViewWidget
            scriptUrl={`${scriptUrl}symbol-info.js`}
            config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
            height={170}
          />

          <TradingViewWidget
            scriptUrl={`${scriptUrl}advanced-chart.js`}
            config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
            className="custom-chart"
            height={600}
          />

          <TradingViewWidget
            scriptUrl={`${scriptUrl}advanced-chart.js`}
            config={BASELINE_WIDGET_CONFIG(symbol)}
            className="custom-chart"
            height={600}
          />

          <TradingViewWidget
            scriptUrl={`${scriptUrl}technical-analysis.js`}
            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
            height={400}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <WatchlistButton symbol={symbol} company={symbol} isInWatchlist={isInWatchlist} />
          </div>

          <section aria-labelledby="company-news-title" className="flex flex-col gap-4">
            <h2 id="company-news-title" className="font-semibold text-xl text-gray-100">Latest {symbol} news</h2>
            <Suspense fallback={<NewsLoading />}>
              <NewsList symbol={symbol} />
            </Suspense>
          </section>

          <TradingViewWidget
            scriptUrl={`${scriptUrl}symbol-profile.js`}
            config={COMPANY_PROFILE_WIDGET_CONFIG(tradingViewSymbol)}
            height={440}
          />
        </div>

        {/* Full width, so TradingView has room to show its financial statements side by side */}
        <div className="md:col-span-2">
          <TradingViewWidget
            scriptUrl={`${scriptUrl}financials.js`}
            config={COMPANY_FINANCIALS_WIDGET_CONFIG(tradingViewSymbol)}
            height={464}
          />
        </div>
      </section>
    </div>
  );
}
