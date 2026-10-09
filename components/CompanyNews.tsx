'use client';

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

export type CompanyNewsArticle = MarketNewsArticle & { timeAgo: string };

// How many articles show before "Show more news"
const INITIAL_COUNT = 5;

const CompanyNews = ({ articles }: { articles: CompanyNewsArticle[] }) => {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? articles : articles.slice(0, INITIAL_COUNT);

    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
                {visible.map((article) => (
                    <li key={`${article.id}-${article.url}`}>
                        <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="news-item flex flex-col hover:border-gray-500 transition-colors"
                        >
                            <span className="news-meta gap-2">
                                <span className="font-medium text-gray-400">{article.source}</span>
                                <span aria-hidden>·</span>
                                <span>{article.timeAgo}</span>
                            </span>
                            <span className="news-title mt-1">{article.headline}</span>
                            {article.summary && <span className="news-summary line-clamp-2!">{article.summary}</span>}
                            <span className="news-cta inline-flex items-center gap-1">
                                Read article
                                <ArrowUpRight aria-hidden className="h-4 w-4" />
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
            {articles.length > INITIAL_COUNT && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="h-11 w-full rounded border border-gray-600 text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-100 transition-colors cursor-pointer"
                >
                    {showAll ? "Show less" : `Show more news (${articles.length - INITIAL_COUNT})`}
                </button>
            )}
        </div>
    );
};

export default CompanyNews;
