import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import StockChartPanel from "@/components/StockChartPanel";
import CompanyNews from "@/components/CompanyNews";
import StockHeader from "@/components/StockHeader";
import StockKeyStats from "@/components/StockKeyStats";
import {
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
  TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";
import { isStockInWatchlist } from "@/lib/actions/watchlist.actions";
import { getCompanyNews, getStockOverview } from "@/lib/stock-data";
import { getSession } from "@/lib/better-auth/auth";
import { cn, formatTimeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: StockDetailsPageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} · Loops Watch` };
}

// Loads the company's news separately, so the rest of the page doesn't wait for it
async function NewsList({ symbol }: { symbol: string }) {
  const articles = await getCompanyNews(symbol);

  if (articles === null) {
    return <p className="px-4 py-3 text-sm text-gray-500">News couldn&apos;t load right now. Refresh the page to try again.</p>;
  }
  if (articles.length === 0) {
    return <p className="px-4 py-3 text-sm text-gray-500">No news about {symbol} in the past week.</p>;
  }

  return <CompanyNews articles={articles.map((article) => ({ ...article, timeAgo: formatTimeAgo(article.datetime) }))} />;
}

const NewsLoading = () => (
  <div className="flex flex-col divide-y divide-gray-600" aria-label="Loading news">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="h-24 animate-pulse bg-gray-700/30 motion-reduce:animate-none" />
    ))}
  </div>
);

export default async function StockDetails({ params }: StockDetailsPageProps) {
  // The layout checks the session too, but it renders alongside this page, so check before asking Finnhub
  const session = await getSession(await headers());
  if (!session?.user) redirect("/sign-in");

  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const [overview, isInWatchlist] = await Promise.all([getStockOverview(symbol), isStockInWatchlist(symbol)]);
  // TradingView's profile and financials stay blank without the exchange (NASDAQ:AAPL), which Finnhub
  // doesn't give for funds it has no profile for, so those panels only show when it's known
  const hasExchange = overview.tradingViewSymbol.includes(":");
  const isFund = overview.kind === "fund";

  return (
    <div className="flex flex-col gap-6">
      <StockHeader overview={overview} isInWatchlist={isInWatchlist} />
      <StockKeyStats overview={overview} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <StockChartPanel symbol={symbol} />
        </div>
        <Panel title="Latest news" description={`${symbol} headlines from the past week · Finnhub`}>
          <Suspense fallback={<NewsLoading />}>
            <NewsList symbol={symbol} />
          </Suspense>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {hasExchange && (
          <Panel title={isFund ? "Fund profile" : "Company profile"} description="TradingView" className="lg:col-span-2">
            <TradingViewWidget
              scriptUrl={`${TRADINGVIEW_SCRIPT_URL}symbol-profile.js`}
              config={COMPANY_PROFILE_WIDGET_CONFIG(overview.tradingViewSymbol)}
              height={440}
            />
          </Panel>
        )}
        <Panel title="Technical analysis" description="TradingView's indicator summary, 1-hour" className={cn(!hasExchange && "lg:col-span-3")}>
          <TradingViewWidget
            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}technical-analysis.js`}
            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(overview.tradingViewSymbol)}
            height={440}
          />
        </Panel>
      </div>

      {/* Full width, so TradingView has room to show its statements side by side. A fund has no income statement. */}
      {hasExchange && !isFund && (
        <Panel title="Financials" description="Income statement, balance sheet and cash flow · TradingView">
          <TradingViewWidget
            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}financials.js`}
            config={COMPANY_FINANCIALS_WIDGET_CONFIG(overview.tradingViewSymbol)}
            height={464}
          />
        </Panel>
      )}
    </div>
  );
}
