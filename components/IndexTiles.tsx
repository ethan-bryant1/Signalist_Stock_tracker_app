'use client';

import Link from "next/link";
import DayRange from "@/components/DayRange";
import FlashingPrice from "@/components/FlashingPrice";
import { useLiveMarket } from "@/components/LiveMarket";
import { INDEX_ETFS } from "@/lib/data/markets";
import type { MarketQuote } from "@/lib/actions/finnhub.actions";
import { cn, formatChangePercent, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

const IndexTile = ({ symbol, label, quote }: { symbol: string; label: string; quote?: MarketQuote }) => {
    const { price, change, changePercent, dayLow, dayHigh } = quote ?? {};

    return (
        <Link
            href={`/stocks/${symbol}`}
            className="group flex min-w-0 flex-col rounded-xl border border-gray-600 bg-gray-800 p-4 transition-colors hover:border-gray-500"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-gray-100">{label}</span>
                <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[11px] font-semibold text-gray-400" title={`Tracked with the ${symbol} fund`}>
                    {symbol}
                </span>
            </div>
            <p className="mt-3 truncate text-xl font-semibold tabular-nums tracking-tight text-gray-100 sm:text-2xl">
                {price !== undefined ? <FlashingPrice value={price} /> : "—"}
            </p>
            <p className={cn("mt-0.5 truncate text-sm font-medium tabular-nums", getChangeColorClass(changePercent))}>
                {change !== undefined && changePercent !== undefined
                    ? `${formatSignedNumber(change)} (${formatChangePercent(changePercent)})`
                    : "Price unavailable"}
            </p>
            {price !== undefined && dayLow !== undefined && dayHigh !== undefined && (
                <DayRange low={dayLow} high={dayHigh} price={price} />
            )}
        </Link>
    );
};

// One tile per major index, with live prices from the funds that track them
const IndexTiles = () => {
    const { quotes } = useLiveMarket();

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {INDEX_ETFS.map(({ symbol, label }) => (
                <IndexTile key={symbol} symbol={symbol} label={label} quote={quotes[symbol]} />
            ))}
        </div>
    );
};

export default IndexTiles;
