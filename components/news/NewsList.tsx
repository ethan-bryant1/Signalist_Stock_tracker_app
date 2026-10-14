"use client";

import { useMemo, useState } from "react";
import NewsRow from "@/components/news/NewsRow";
import { groupByDay, type NewsDensity, type NewsItem } from "@/lib/news";

const PAGE = 40;

type Props = {
    items: readonly NewsItem[];
    now: number;
    density: NewsDensity;
    showFeed?: boolean;
    // Group under "Today", "Yesterday", "Mon, Oct 12" (newest-first and oldest-first lists alike)
    grouped?: boolean;
    savedUrls?: ReadonlySet<string>;
    onToggleSave?: (item: NewsItem) => void;
    label: string;
};

// Headlines as rows, a page at a time, with "Show more" for the rest of what's loaded
const NewsList = ({ items, now, density, showFeed, grouped = true, savedUrls, onToggleSave, label }: Props) => {
    const [limit, setLimit] = useState(PAGE);
    const shown = useMemo(() => items.slice(0, limit), [items, limit]);
    const groups = useMemo(() => (grouped ? groupByDay(shown, now) : [{ day: "all", label: "", items: shown }]), [grouped, shown, now]);

    return (
        <div aria-label={label} role="region">
            {groups.map((group) => (
                <section key={group.day} aria-label={group.label || undefined}>
                    {group.label && (
                        <h3 className="border-b border-gray-600 bg-gray-900/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            {group.label}
                        </h3>
                    )}
                    <ul className="divide-y divide-gray-600/70">
                        {group.items.map((item) => (
                            <li key={item.id + item.url}>
                                <NewsRow item={item} now={now} density={density} showFeed={showFeed} saved={savedUrls?.has(item.url)} onToggleSave={onToggleSave} />
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            {items.length > limit && (
                <button
                    type="button"
                    onClick={() => setLimit((value) => value + PAGE)}
                    className="h-11 w-full cursor-pointer border-t border-gray-600 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-100"
                >
                    Show more ({Math.min(PAGE, items.length - limit)} of {items.length - limit} more)
                </button>
            )}
        </div>
    );
};

export default NewsList;
