'use client';

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CompanyNewsArticle = MarketNewsArticle & { timeAgo: string };

// On phones the first few articles show, with a button for the rest.
// On wide screens they all show in a list that scrolls beside the price chart.
const INITIAL_COUNT = 5;

const CompanyNews = ({ articles }: { articles: CompanyNewsArticle[] }) => {
    const [showAll, setShowAll] = useState(false);

    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3 scrollbar-hide-default lg:max-h-[560px] lg:overflow-y-auto lg:pb-6 lg:[mask-image:linear-gradient(to_bottom,black_calc(100%-48px),transparent)]">
                {articles.map((article, index) => (
                    <li key={`${article.id}-${article.url}`} className={cn(!showAll && index >= INITIAL_COUNT && "hidden lg:block")}>
                        <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col gap-2 rounded-xl border border-gray-600 bg-gray-800 p-4 transition-colors hover:border-gray-500"
                        >
                            <span className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="truncate font-medium text-gray-400">{article.source}</span>
                                <span aria-hidden>·</span>
                                <time dateTime={new Date(article.datetime * 1000).toISOString()} className="shrink-0">{article.timeAgo}</time>
                                <ArrowUpRight aria-hidden className="ml-auto h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </span>
                            <span className="line-clamp-2 text-base font-semibold leading-snug text-gray-100">{article.headline}</span>
                            {article.summary && <span className="line-clamp-2 text-sm leading-relaxed text-gray-400">{article.summary}</span>}
                        </a>
                    </li>
                ))}
            </ul>
            {articles.length > INITIAL_COUNT && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="h-11 w-full rounded-lg border border-gray-600 text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-100 transition-colors cursor-pointer lg:hidden"
                >
                    {showAll ? "Show less" : `Show more news (${articles.length - INITIAL_COUNT})`}
                </button>
            )}
        </div>
    );
};

export default CompanyNews;
