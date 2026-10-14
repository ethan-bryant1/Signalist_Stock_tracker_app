"use client";

import { useMemo } from "react";
import NewsRow from "@/components/news/NewsRow";
import { useNow } from "@/hooks/useHeatmapFeed";
import { useMarketNews } from "@/hooks/useMarketNews";
import { headlineStatus, pickHeadlines } from "@/lib/news";
import type { NewsResult } from "@/lib/news-data";
import { cn } from "@/lib/utils";

// How many headlines the Dashboard shows (the panel sits beside the 600px-tall market data table)
export const DASHBOARD_HEADLINES = 8;

// The Dashboard's Market news panel body: the newest market headlines (at most a few M&A stories) as compact rows,
// each with its publisher, New York time, age and tickers. A subset of the News page's feed, from the same cached copy.
const DashboardNews = ({ initial }: { initial: NewsResult }) => {
    const { result, failed } = useMarketNews(initial);
    const now = useNow(initial.checkedAt);
    const items = useMemo(() => pickHeadlines(result?.items ?? [], DASHBOARD_HEADLINES), [result]);
    const status = result ? headlineStatus(result, now, failed) : null;

    if (!result || (items.length === 0 && (result.issue || failed))) {
        return <p className="px-4 py-10 text-center text-sm text-gray-400">Headlines couldn&apos;t load right now. They&apos;ll try again in a few minutes.</p>;
    }
    if (items.length === 0) return <p className="px-4 py-10 text-center text-sm text-gray-400">Finnhub sent no headlines.</p>;

    return (
        <div className="flex flex-col">
            <ul className="divide-y divide-gray-600/70" aria-label="Latest market headlines">
                {items.map((item) => (
                    <li key={item.id + item.url}>
                        <NewsRow item={item} now={now} density="compact" showFeed />
                    </li>
                ))}
            </ul>
            {status && (
                <p role="status" className={cn("border-t border-gray-600 px-4 py-2 text-[11px]", status.warning ? "font-medium text-gray-100" : "text-gray-500")}>
                    {status.text}
                </p>
            )}
        </div>
    );
};

export default DashboardNews;
