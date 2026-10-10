'use client';

import { useLiveMarket } from "@/components/LiveMarket";
import type { MarketSession } from "@/lib/actions/finnhub.actions";
import { cn } from "@/lib/utils";

const SESSION_LABELS: Record<MarketSession, string> = {
    "pre-market": "Pre-market",
    regular: "Market open",
    "post-market": "After hours",
    closed: "Market closed",
};

// "3:41 PM ET" while trading, or "Fri 4:00 PM ET" outside trading hours, so an old price isn't mistaken for today's
const formatAsOf = (time: number, withDay: boolean) =>
    `${new Intl.DateTimeFormat("en-US", {
        weekday: withDay ? "short" : undefined,
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
    }).format(time)} ET`;

// Pill showing whether the US market is trading and when prices last changed
const MarketStatusBadge = ({ className }: { className?: string }) => {
    const { session, holiday, asOf } = useLiveMarket();
    const isOpen = session === "regular";
    const label = session === "closed" && holiday ? `Closed for ${holiday}` : SESSION_LABELS[session];

    return (
        <div
            className={cn(
                "inline-flex h-8 w-fit shrink-0 items-center gap-2 rounded-full border border-gray-600 bg-gray-800 px-3 text-xs font-medium",
                className
            )}
        >
            <span className="relative flex h-2 w-2" aria-hidden>
                {isOpen && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />}
                <span
                    className={cn(
                        "relative inline-flex h-2 w-2 rounded-full",
                        isOpen ? "bg-green-500" : session === "closed" ? "bg-gray-500" : "bg-gray-400"
                    )}
                />
            </span>
            <span className="text-gray-100">{label}</span>
            {asOf && (
                <>
                    <span aria-hidden className="text-gray-500">·</span>
                    <span className="text-gray-500 tabular-nums">As of {formatAsOf(asOf, !isOpen)}</span>
                </>
            )}
        </div>
    );
};

export default MarketStatusBadge;
