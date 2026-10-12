import DayRange from "@/components/DayRange";
import StockLogo from "@/components/StockLogo";
import { SECTOR_BY_NAME } from "@/lib/data/markets";
import { formatNewYorkMoment, type Freshness, type HeatmapStock } from "@/lib/market-data";
import { cn, formatChangePercent, formatCurrency, formatMarketCapValue, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

// The pieces of a stock's quote shared by the heatmap's hover card and its selected-stock panel,
// so both always show the same figures the same way

export const sectorName = (sector: string) => SECTOR_BY_NAME.get(sector)?.sector ?? sector;

// Logo, ticker, exchange and company name
export const QuoteIdentity = ({ stock, logoClassName, titleId }: { stock: HeatmapStock; logoClassName?: string; titleId?: string }) => (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <StockLogo key={stock.logo ?? stock.symbol} symbol={stock.symbol} logo={stock.logo} className={cn("h-9 w-9 rounded-md p-1 text-xs", logoClassName)} />
        <div className="min-w-0 flex-1">
            <p id={titleId} className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-gray-100">{stock.symbol}</span>
                {stock.exchange && <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{stock.exchange}</span>}
            </p>
            <p className="truncate text-xs text-gray-500" title={stock.name}>{stock.name}</p>
        </div>
    </div>
);

// The price, with the dollar and percent change since the previous close, or over `changeLabel`'s period
export const QuotePrice = ({ stock, large = false, changeLabel }: { stock: HeatmapStock; large?: boolean; changeLabel?: string }) => {
    const quote = stock.quote;
    const change = quote?.change;
    const changePercent = quote?.changePercent;
    const rounded = changePercent !== undefined ? Math.round(changePercent * 100) / 100 : 0;
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className={cn("font-semibold tabular-nums tracking-tight text-gray-100", quote ? (large ? "text-2xl" : "text-xl") : "text-sm text-gray-500")}>
                {quote ? formatCurrency(quote.price) : "Price unavailable"}
            </span>
            {change !== undefined && changePercent !== undefined && (
                <span className={cn("shrink-0 font-semibold tabular-nums", large ? "text-sm" : "text-xs", getChangeColorClass(changePercent))}>
                    {rounded !== 0 && <span aria-hidden className="mr-1 text-[10px]">{rounded > 0 ? "▲" : "▼"}</span>}
                    {formatSignedNumber(change)} ({formatChangePercent(changePercent)})
                    {changeLabel && <span className="ml-1 font-medium text-gray-500">{changeLabel}</span>}
                </span>
            )}
        </div>
    );
};

const Stat = ({ label, value, hint }: { label: string; value?: React.ReactNode; hint?: string }) => (
    <>
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-right font-medium tabular-nums text-gray-100" title={hint}>{value ?? "—"}</dd>
    </>
);

// Open, previous close, day range and market cap. Figures the provider didn't send show as a dash.
export const QuoteStats = ({ stock, showRangeBar = true }: { stock: HeatmapStock; showRangeBar?: boolean }) => {
    const { quote, marketCap } = stock;
    const hasRange = quote?.dayLow !== undefined && quote.dayHigh !== undefined;
    return (
        <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <Stat label="Open" value={quote?.open !== undefined ? formatCurrency(quote.open) : undefined} />
                <Stat label="Prev close" value={quote?.previousClose !== undefined ? formatCurrency(quote.previousClose) : undefined} />
                <Stat label="Market cap" value={marketCap ? formatMarketCapValue(marketCap) : undefined} hint="Company market cap from Finnhub, updated daily" />
                <Stat label="Day range" value={hasRange ? `${formatCurrency(quote!.dayLow!)} – ${formatCurrency(quote!.dayHigh!)}` : undefined} />
            </dl>
            {showRangeBar && hasRange && <DayRange low={quote!.dayLow!} high={quote!.dayHigh!} price={quote!.price} showLabels={false} className="mt-2" />}
        </>
    );
};

const FRESHNESS_LABEL: Record<Freshness, string> = { fresh: "", stale: "Stale", missing: "No price" };

// When the price is from, and a warning when it's stale or missing
export const QuoteTime = ({ stock, freshness, now, className }: { stock: HeatmapStock; freshness: Freshness; now: number; className?: string }) => (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-gray-500", className)}>
        {freshness !== "fresh" && (
            <span className="rounded-sm border border-gray-500 px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {FRESHNESS_LABEL[freshness]}
            </span>
        )}
        {stock.quote?.time !== undefined ? <span>Price as of {formatNewYorkMoment(stock.quote.time, now)}</span> : stock.quote ? <span>Price time unknown</span> : <span>Finnhub sent no price</span>}
    </p>
);
