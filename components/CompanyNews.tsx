"use client";

import { useMemo, useState } from "react";
import NewsRow from "@/components/news/NewsRow";
import { useNow } from "@/hooks/useHeatmapFeed";
import { fromCompanyArticle } from "@/lib/news";
import { cn } from "@/lib/utils";

// On phones the first few articles show, with a button for the rest.
// On wide screens they all show in a list that scrolls beside the price chart. Rows of a panel, not cards, drawn
// like the News page's (components/news/NewsRow.tsx).
const INITIAL_COUNT = 5;

const CompanyNews = ({ articles, renderedAt }: { articles: MarketNewsArticle[]; renderedAt: number }) => {
    const [showAll, setShowAll] = useState(false);
    const now = useNow(renderedAt);
    const items = useMemo(() => articles.map(fromCompanyArticle), [articles]);

    return (
        <div className="flex flex-col">
            <ul className="divide-y divide-gray-600 scrollbar-hide-default lg:max-h-[592px] lg:overflow-y-auto">
                {items.map((item, index) => (
                    <li key={item.id + item.url} className={cn(!showAll && index >= INITIAL_COUNT && "hidden lg:block")}>
                        <NewsRow item={item} now={now} density="comfortable" />
                    </li>
                ))}
            </ul>
            {items.length > INITIAL_COUNT && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="h-11 w-full cursor-pointer border-t border-gray-600 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-100 lg:hidden"
                >
                    {showAll ? "Show less" : `Show more news (${items.length - INITIAL_COUNT})`}
                </button>
            )}
        </div>
    );
};

export default CompanyNews;
