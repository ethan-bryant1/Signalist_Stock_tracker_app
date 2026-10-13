'use client';

import { AlertTriangle } from "lucide-react";
import { useLiveMarket } from "@/components/LiveMarket";
import { useNow } from "@/hooks/useHeatmapFeed";
import type { FeedIssue } from "@/lib/market-data";
import { priceStamp } from "@/lib/price-stamp";
import { cn } from "@/lib/utils";

// Where a price came from and how old it is ("Finnhub · 10:42 AM ET", "Close · Fri, Oct 9, 4:00 PM ET",
// "Cached · …"), so a cached, delayed or last-session price is never read as a live one.
// renderedAt is the server's time when the page was made, so the first render matches the server's HTML.
const PriceStamp = ({
    hasPrice,
    quoteTime,
    cached,
    issue,
    renderedAt,
    source,
    className,
}: {
    hasPrice: boolean;
    quoteTime?: number;
    cached?: boolean;
    issue?: FeedIssue;
    renderedAt: number;
    source?: string;
    className?: string;
}) => {
    const { session } = useLiveMarket();
    const now = useNow(renderedAt);
    const stamp = priceStamp({ hasPrice, quoteTime, cached, issue, session, now, source });

    return (
        <span
            title={stamp.detail}
            className={cn("inline-flex items-center gap-1 text-xs tabular-nums", stamp.tone === "warning" ? "font-medium text-gray-100" : "text-gray-500", className)}
        >
            {stamp.tone === "warning" && <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />}
            <span>{stamp.text}</span>
            <span className="sr-only">. {stamp.detail}</span>
        </span>
    );
};

export default PriceStamp;
