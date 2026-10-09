import { Suspense } from "react";
import type { Metadata } from "next";
import TradingViewWidget from "@/components/TradingViewWidget";
import CompanyNews from "@/components/CompanyNews";
import StockHeader from "@/components/StockHeader";
import StockKeyStats from "@/components/StockKeyStats";
import {
  CANDLE_CHART_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
  TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";
import { isStockInWatchlist } from "@/lib/actions/watchlist.actions";
import { getCompanyNews, getStockOverview } from "@/lib/actions/finnhub.actions";
import { cn, formatTimeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: StockDetailsPageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} · Loops Watch` };
}

// A titled block of the page. TradingView's financials widget brings its own title, so title is optional.
const Section = ({ title, className, children }: { title?: string; className?: string; children: React.ReactNode }) => (
  <section className={cn("flex min-w-0 flex-col gap-4", className)}>
    {title && <h2 className="text-lg font-semibold text-gray-100">{title}</h2>}
    {children}
  </section>
);

// Loads the company's news separately, so the rest of the page doesn't wait for it
async function NewsList({ symbol }: { symbol: string }) {
  const articles = await getCompanyNews(symbol);

  if (articles === null) {
    return <p className="text-sm text-gray-500">News couldn&apos;t load right now. Refresh the page to try again.</p>;
  }
  if (articles.length === 0) {
    return <p className="text-sm text-gray-500">No news about {symbol} in the past week.</p>;
  }

  return <CompanyNews articles={articles.map((article) => ({ ...article, timeAgo: formatTimeAgo(article.datetime) }))} />;
}

const NewsLoading = () => (
  <div className="flex flex-col gap-3" aria-label="Loading news">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-32 rounded-xl border border-gray-600 bg-gray-800 animate-pulse" />
    ))}
  </div>
);

export default async function StockDetails({ params }: StockDetailsPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const [overview, isInWatchlist] = await Promise.all([getStockOverview(symbol), isStockInWatchlist(symbol)]);

  return (
    <div className="flex flex-col gap-8">
      <StockHeader overview={overview} isInWatchlist={isInWatchlist} />
      <StockKeyStats overview={overview} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Section title="Price chart" className="lg:col-span-2">
          <TradingViewWidget
            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}advanced-chart.js`}
            config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
            className="custom-chart"
            height={560}
          />
        </Section>
        <Section title="Latest news">
          <Suspense fallback={<NewsLoading />}>
            <NewsList symbol={symbol} />
          </Suspense>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Section title="Company profile" className="lg:col-span-2">
          <TradingViewWidget
            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}symbol-profile.js`}
            config={COMPANY_PROFILE_WIDGET_CONFIG(overview.tradingViewSymbol)}
            height={440}
          />
        </Section>
        <Section title="Technical analysis">
          <TradingViewWidget
            scriptUrl={`${TRADINGVIEW_SCRIPT_URL}technical-analysis.js`}
            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
            height={440}
          />
        </Section>
      </div>

      {/* Full width, so TradingView has room to show its financial statements side by side */}
      <Section>
        <TradingViewWidget
          scriptUrl={`${TRADINGVIEW_SCRIPT_URL}financials.js`}
          config={COMPANY_FINANCIALS_WIDGET_CONFIG(overview.tradingViewSymbol)}
          height={464}
        />
      </Section>
    </div>
  );
}
