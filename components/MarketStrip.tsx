'use client';

import { useSyncExternalStore } from "react";
import Link from "next/link";
import FlashingPrice from "@/components/FlashingPrice";
import { useLiveMarket } from "@/components/LiveMarket";
import type { MarketSession } from "@/lib/actions/finnhub.actions";
import { INDEX_ETFS, MACRO_ETFS } from "@/lib/data/markets";
import { cn, formatChangePercent, getChangeColorClass } from "@/lib/utils";

const [SPY, QQQ, DIA, IWM] = INDEX_ETFS;
const [GLD, USO, TLT] = MACRO_ETFS;

// Beside the market status, wider screens have room for more prices, so none is cut off part way.
// Phones hide the status and scroll through every price instead.
const STRIP_FUNDS: { symbol: string; label: string; className?: string }[] = [
    SPY,
    QQQ,
    { ...DIA, className: "sm:hidden lg:block" },
    { ...IWM, className: "sm:hidden lg:block" },
    { ...GLD, className: "sm:hidden xl:block" },
    { ...USO, className: "sm:hidden 2xl:block" },
    { ...TLT, className: "sm:hidden 2xl:block" },
];

const SESSION_LABELS: Record<MarketSession, string> = {
    "pre-market": "Pre-market",
    regular: "Market open",
    "post-market": "After hours",
    closed: "Market closed",
};

const NEW_YORK_TIME = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
});

// "Fri 4:00 PM", for when prices last changed
const NEW_YORK_DAY_TIME = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
});

const subscribeToSeconds = (onTick: () => void) => {
    const timer = window.setInterval(onTick, 1000);
    return () => window.clearInterval(timer);
};
const currentSecond = () => Math.floor(Date.now() / 1000);

// New York time, ticking every second. The server leaves it blank so the page's first render matches.
const MarketClock = () => {
    const second = useSyncExternalStore(subscribeToSeconds, currentSecond, () => null);

    return (
        <span className="w-[6.5rem] text-right tabular-nums text-gray-400" title="Time in New York, where US markets trade">
            {second !== null && `${NEW_YORK_TIME.format(second * 1000)} ET`}
        </span>
    );
};

// The header's second row: live prices for the major indexes, gold, oil and bonds,
// then whether the US market is trading and the time in New York, like a trading platform's ticker bar
const MarketStrip = () => {
    const { quotes, session, holiday, asOf } = useLiveMarket();
    const isOpen = session === "regular";
    const label = session === "closed" && holiday ? `Closed for ${holiday}` : SESSION_LABELS[session];

    return (
        <div className="border-b border-gray-600 bg-gray-900">
            <div className="container flex h-9 items-center gap-4 text-xs">
                <ul
                    aria-label="Market prices"
                    className="-ml-3 flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-hide max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
                >
                    {STRIP_FUNDS.map(({ symbol, label: name, className }) => {
                        const quote = quotes[symbol];
                        return (
                            <li key={symbol} className={cn("shrink-0 border-l border-gray-600 first:border-l-0", className)}>
                                <Link
                                    href={`/stocks/${symbol}`}
                                    title={`${name}, tracked with the ${symbol} fund. Open ${symbol}.`}
                                    className="flex h-9 items-center gap-2 px-3 transition-colors hover:bg-gray-800"
                                >
                                    <span className="font-medium text-gray-500">{name}</span>
                                    <span className="font-semibold tabular-nums text-gray-100">
                                        {quote?.price !== undefined ? <FlashingPrice value={quote.price} format={(value) => value.toFixed(2)} /> : "—"}
                                    </span>
                                    {quote?.changePercent !== undefined && (
                                        <span className={cn("font-medium tabular-nums", getChangeColorClass(quote.changePercent))}>
                                            {formatChangePercent(quote.changePercent)}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>

                <div
                    className="hidden shrink-0 items-center gap-3 sm:flex"
                    title={asOf ? `Prices as of ${NEW_YORK_DAY_TIME.format(asOf)} ET` : undefined}
                >
                    <span className="flex items-center gap-2 font-medium text-gray-100">
                        <span className="relative flex h-2 w-2" aria-hidden>
                            {isOpen && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />}
                            <span className={cn("relative inline-flex h-2 w-2 rounded-full", isOpen ? "bg-green-500" : session === "closed" ? "bg-gray-500" : "bg-gray-400")} />
                        </span>
                        {label}
                    </span>
                    <span aria-hidden className="h-4 w-px bg-gray-600" />
                    <MarketClock />
                </div>
            </div>
        </div>
    );
};

export default MarketStrip;
