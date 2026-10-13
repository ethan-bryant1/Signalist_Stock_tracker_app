'use client';

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CompanyNewsArticle = MarketNewsArticle & { timeAgo: string };

// On phones the first few articles show, with a button for the rest.
// On wide screens they all show in a list that scrolls beside the price chart. Rows of a panel, not cards.
const INITIAL_COUNT = 5;

const CompanyNews = ({ articles }: { articles: CompanyNewsArticle[] }) => {
    const [showAll, setShowAll] = useState(false);

    return (
        <div className="flex flex-col">
            <ul className="divide-y divide-gray-600 scrollbar-hide-default lg:max-h-[592px] lg:overflow-y-auto">
                {articles.map((article, index) => (
                    <li key={`${article.id}-${article.url}`} className={cn(!showAll && index >= INITIAL_COUNT && "hidden lg:block")}>
                        <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-700/50 focus-visible:bg-gray-700/50 focus-visible:outline-none"
                        >
                            <span className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="truncate font-medium text-gray-400">{article.source}</span>
                                <span aria-hidden>·</span>
                                <time dateTime={new Date(article.datetime * 1000).toISOString()} className="shrink-0">{article.timeAgo}</time>
                                <ArrowUpRight aria-hidden className="ml-auto h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </span>
                            <span className="line-clamp-2 text-sm font-semibold leading-snug text-gray-100">{article.headline}</span>
                            {article.summary && <span className="line-clamp-2 text-xs leading-relaxed text-gray-500">{article.summary}</span>}
                        </a>
                    </li>
                ))}
            </ul>
            {articles.length > INITIAL_COUNT && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="h-11 w-full cursor-pointer border-t border-gray-600 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-100 lg:hidden"
                >
                    {showAll ? "Show less" : `Show more news (${articles.length - INITIAL_COUNT})`}
                </button>
            )}
        </div>
    );
};

export default CompanyNews;
