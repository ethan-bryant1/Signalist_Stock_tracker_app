'use client';

import { useSyncExternalStore } from "react";
import Link from "next/link";
import FlashingPrice from "@/components/FlashingPrice";
import PriceStamp from "@/components/PriceStamp";
import { useLiveMarket } from "@/components/LiveMarket";
import type { MarketSession } from "@/lib/market-data";
import { INDEX_ETFS, MACRO_ETFS } from "@/lib/data/markets";
import { cn, formatChangePercent, getChangeColorClass } from "@/lib/utils";

const [SPY, QQQ, DIA, IWM] = INDEX_ETFS;
const [GLD, USO, TLT] = MACRO_ETFS;

const STRIP_FUNDS = [SPY, QQQ, DIA, IWM, GLD, USO, TLT];

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

type Quotes = ReturnType<typeof useLiveMarket>["quotes"];

// One pass of the ticker. The copy is hidden from screen readers and the keyboard so each price is read once.
const TickerPrices = ({ quotes, copy = false }: { quotes: Quotes; copy?: boolean }) => (
    <ul aria-label={copy ? undefined : "Market prices"} aria-hidden={copy || undefined} className={cn("flex shrink-0 items-center", copy && "market-ticker-copy")}>
        {STRIP_FUNDS.map(({ symbol, label: name }) => {
            const quote = quotes[symbol];
            return (
                <li key={symbol} className="shrink-0 border-l border-gray-600">
                    <Link
                        href={`/stocks/${symbol}`}
                        tabIndex={copy ? -1 : undefined}
                        title={`${name}, tracked with the ${symbol} fund. Open ${symbol}.`}
                        className="flex h-9 items-center gap-2 px-3 transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-100"
                    >
                        <span className="font-medium text-gray-500">{name}</span>
                        <span className="font-semibold tabular-nums text-gray-100">
                            {quote?.price !== undefined ? <FlashingPrice value={quote.price} format={(value) => value.toFixed(2)} /> : "—"}
                        </span>
                        {quote?.changePercent !== undefined && (
                            <span className={cn("font-medium tabular-nums", getChangeColorClass(quote.changePercent))}>{formatChangePercent(quote.changePercent)}</span>
                        )}
                    </Link>
                </li>
            );
        })}
    </ul>
);

// The header's second row: a scrolling ticker of the major indexes, gold, oil and bonds,
// then whether the US market is trading and the time in New York, like a trading platform's ticker bar
const MarketStrip = () => {
    const { quotes, session, holiday, asOf, refreshFailing, cachedCount, issue, checkedAt } = useLiveMarket();
    const isOpen = session === "regular";
    const label = session === "closed" && holiday ? `Closed for ${holiday}` : SESSION_LABELS[session];

    return (
        <div className="border-b border-gray-600/70">
            <div className="container flex h-9 items-center gap-4 text-xs">
                {/* The prices scroll past on a loop: the list is drawn three times so the copies fill even a wide screen
                    without a gap. Hovering pauses it, keyboard focus stops it, and with reduced motion it is a still,
                    scrollable row. */}
                <div className="market-ticker -ml-3 min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-2rem),transparent)]">
                    <div className="market-ticker-track flex w-max">
                        <TickerPrices quotes={quotes} />
                        <TickerPrices quotes={quotes} copy />
                        <TickerPrices quotes={quotes} copy />
                    </div>
                </div>

                <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    {/* The clock already gives the time, so the prices' own time shows only when they are cached, delayed or missing */}
                    <PriceStamp
                        hasPrice={asOf !== undefined}
                        quoteTime={asOf}
                        cached={!!refreshFailing || !!cachedCount}
                        issue={issue}
                        renderedAt={checkedAt}
                        warningOnly
                        className="hidden border-r border-gray-600 pr-3 lg:inline-flex"
                    />
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
