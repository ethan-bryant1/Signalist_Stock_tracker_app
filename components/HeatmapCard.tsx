import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import DayRange from "@/components/DayRange";
import StockLogo from "@/components/StockLogo";
import type { HeatmapStock } from "@/lib/actions/finnhub.actions";
import { MARKET_SECTORS } from "@/lib/data/sp500";
import { cn, formatChangePercent, formatCurrency, formatMarketCapValue, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

// How the card was opened: hovering with a mouse, moving with the keyboard, or tapping on a touch screen
export type InspectSource = "pointer" | "keyboard" | "touch";

const SECTOR_LABELS = new Map<string, string>(MARKET_SECTORS.map(({ value, label }) => [value, label]));

// "Fri 3:59 PM", the time of the price in New York
const NEW_YORK_DAY_TIME = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
});

const Stat = ({ label, value }: { label: string; value?: string }) => (
    <>
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-right font-medium tabular-nums text-gray-100">{value ?? "—"}</dd>
    </>
);

// A heatmap stock's details, like a trading platform's quote panel: who it is, its price and today's move first,
// then size, the day's prices and its sector. Figures Finnhub didn't send show as a dash.
const HeatmapCard = ({ stock, source, onClose }: { stock: HeatmapStock; source: InspectSource; onClose?: () => void }) => {
    const { symbol, name, exchange, logo, currency, price, change, changePercent, marketCap, open, previousClose, dayHigh, dayLow, sector, industry, time } = stock;
    const direction = !changePercent ? null : changePercent > 0 ? "up" : "down";
    const hasRange = dayLow !== undefined && dayHigh !== undefined;

    return (
        <div className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-gray-400 shadow-2xl shadow-black/40">
            <div className="flex items-start gap-2.5">
                <StockLogo symbol={symbol} logo={logo} className="h-9 w-9 rounded-md p-1 text-xs" />
                <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-gray-100">{symbol}</span>
                        {exchange && <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{exchange}</span>}
                    </p>
                    <p className="truncate text-xs text-gray-500">{name}</p>
                </div>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close stock details"
                        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className={cn("font-semibold tabular-nums tracking-tight text-gray-100", price !== undefined ? "text-xl" : "text-sm text-gray-500")}>
                    {price !== undefined ? formatCurrency(price, currency) : "Price unavailable"}
                </span>
                {change !== undefined && changePercent !== undefined && (
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", getChangeColorClass(changePercent))}>
                        {direction && <span aria-hidden className="mr-1 text-[10px]">{direction === "up" ? "▲" : "▼"}</span>}
                        {formatSignedNumber(change)} ({formatChangePercent(changePercent)})
                    </span>
                )}
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-gray-600 pt-2.5 text-xs">
                <Stat label="Market cap" value={marketCap ? formatMarketCapValue(marketCap) : undefined} />
                <Stat label="Open" value={open !== undefined ? formatCurrency(open, currency) : undefined} />
                <Stat label="Prev close" value={previousClose !== undefined ? formatCurrency(previousClose, currency) : undefined} />
                <Stat label="Day range" value={hasRange ? `${formatCurrency(dayLow, currency)} – ${formatCurrency(dayHigh, currency)}` : undefined} />
            </dl>
            {hasRange && price !== undefined && <DayRange low={dayLow} high={dayHigh} price={price} currency={currency} showLabels={false} className="mt-2" />}

            <p className="mt-2.5 truncate border-t border-gray-600 pt-2 text-[11px] text-gray-500" title={`${sector} · ${industry}`}>
                <span className="font-medium text-gray-400">{SECTOR_LABELS.get(sector) ?? sector}</span> · {industry}
            </p>

            <p className="mt-1 flex justify-between gap-2 text-[11px] text-gray-500">
                {source !== "touch" && <span>{source === "keyboard" ? "Enter to open" : "Click to open"}</span>}
                {time && <span className="tabular-nums">As of {NEW_YORK_DAY_TIME.format(time)} ET</span>}
            </p>
            {source === "touch" && (
                <Link
                    href={`/stocks/${symbol}`}
                    className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90"
                >
                    Open {symbol}
                    <ArrowUpRight className="h-4 w-4" />
                </Link>
            )}
        </div>
    );
};

export default HeatmapCard;
