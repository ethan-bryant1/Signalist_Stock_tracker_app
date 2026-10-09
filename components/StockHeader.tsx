import { Globe } from "lucide-react";
import StockLogo from "@/components/StockLogo";
import WatchlistButton from "@/components/WatchlistButton";
import type { StockOverview } from "@/lib/actions/finnhub.actions";
import { cn, formatChangePercent, formatCurrency, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

// "https://www.apple.com/" becomes "apple.com"
const websiteLabel = (url?: string) => {
    if (!url) return undefined;
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return undefined;
    }
};

// Top of a stock's page: logo, name, where it trades, the latest price and the watchlist button
const StockHeader = ({ overview, isInWatchlist }: { overview: StockOverview; isInWatchlist: boolean }) => {
    const { symbol, name, logo, exchange, industry, website, currency, price, change, changePercent } = overview;
    const details = [symbol, exchange, industry].filter(Boolean).join(" · ");
    const siteLabel = websiteLabel(website);

    return (
        <section className="flex flex-col gap-6 rounded-xl border border-gray-600 bg-gray-800 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
                <StockLogo symbol={symbol} logo={logo} />
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">{name ?? symbol}</h1>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span>{details}</span>
                        {siteLabel && (
                            <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-gray-100 transition-colors">
                                <Globe aria-hidden className="h-3.5 w-3.5" />
                                {siteLabel}
                            </a>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:gap-8">
                <div className="lg:text-right">
                    <p className="text-3xl font-semibold tabular-nums tracking-tight text-gray-100">
                        {price !== undefined ? formatCurrency(price, currency) : "—"}
                    </p>
                    {change !== undefined && changePercent !== undefined && (
                        <p className={cn("mt-1 text-sm font-medium tabular-nums", getChangeColorClass(changePercent))}>
                            {formatSignedNumber(change)} ({formatChangePercent(changePercent)})
                        </p>
                    )}
                </div>
                <div className="w-full sm:w-56">
                    <WatchlistButton symbol={symbol} company={name ?? symbol} isInWatchlist={isInWatchlist} />
                </div>
            </div>
        </section>
    );
};

export default StockHeader;
