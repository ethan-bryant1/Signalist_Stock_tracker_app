"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { formatNewsAge, formatNewsTime, type NewsDensity, type NewsItem } from "@/lib/news";
import { cn } from "@/lib/utils";

const FEED_LABELS: Record<NewsItem["feed"], string> = { markets: "Markets", deals: "M&A", company: "Company" };
// More tickers than this fold into "+N"; the article's own page lists them all
const MAX_TICKERS = 6;

type Props = {
    item: NewsItem;
    now: number;
    density: NewsDensity;
    // Shows the feed it came from (Markets, M&A, Company)
    showFeed?: boolean;
    saved?: boolean;
    onToggleSave?: (item: NewsItem) => void;
};

// One headline: the publisher and time first (secondary), the headline (opens the original article in a new tab),
// the provider's own summary, and the tickers it named (each opens that symbol's page here). Shared by the News
// page, stock pages and the workspace's news widgets.
const NewsRow = ({ item, now, density, showFeed = false, saved = false, onToggleSave }: Props) => {
    const compact = density === "compact";
    const shown = item.tickers.slice(0, MAX_TICKERS);
    return (
        <article className={cn("group flex gap-3 px-4 transition-colors hover:bg-gray-700/40", compact ? "py-2" : "py-3")}>
            <div className="min-w-0 flex-1">
                <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-5 text-gray-500">
                    <span className="max-w-[16rem] truncate font-semibold text-gray-400">{item.source}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={new Date(item.datetime).toISOString()} title={formatNewsTime(item.datetime, now)} className="tabular-nums">
                        {formatNewsTime(item.datetime, now)}
                    </time>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{formatNewsAge(item.datetime, now)}</span>
                    {showFeed && (
                        <>
                            <span aria-hidden>·</span>
                            <span className="uppercase tracking-wider">{FEED_LABELS[item.feed]}</span>
                        </>
                    )}
                </p>
                <h3 className={cn("font-semibold leading-snug text-gray-100", compact ? "text-[13px]" : "text-sm")}>
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm decoration-gray-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100"
                    >
                        {item.headline}
                        <ArrowUpRight aria-hidden className="ml-0.5 inline h-3.5 w-3.5 align-[-2px] text-gray-500 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                        <span className="sr-only"> (opens {item.source} in a new tab)</span>
                    </a>
                </h3>
                {!compact && item.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{item.summary}</p>}
                {shown.length > 0 && (
                    <ul aria-label="Symbols in this story" className={cn("flex flex-wrap items-center gap-1", compact ? "mt-1" : "mt-2")}>
                        {shown.map((ticker) => (
                            <li key={ticker}>
                                <Link
                                    href={`/stocks/${encodeURIComponent(ticker)}`}
                                    title={`Open ${ticker}`}
                                    className="inline-flex h-5 items-center rounded border border-gray-600 px-1.5 text-[11px] font-semibold tabular-nums text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100"
                                >
                                    {ticker}
                                </Link>
                            </li>
                        ))}
                        {item.tickers.length > shown.length && (
                            <li className="text-[11px] text-gray-500" title={item.tickers.slice(MAX_TICKERS).join(", ")}>
                                +{item.tickers.length - shown.length}
                            </li>
                        )}
                    </ul>
                )}
            </div>
            {onToggleSave && (
                <button
                    type="button"
                    onClick={() => onToggleSave(item)}
                    aria-pressed={saved}
                    aria-label={saved ? `Remove “${item.headline}” from saved` : `Save “${item.headline}”`}
                    title={saved ? "Remove from saved" : "Save for later"}
                    className={cn(
                        "-mr-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100",
                        saved ? "text-gray-100" : "text-gray-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    )}
                >
                    <Bookmark aria-hidden className={cn("h-4 w-4", saved && "fill-current")} />
                </button>
            )}
        </article>
    );
};

export default memo(NewsRow);
