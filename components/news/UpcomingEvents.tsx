"use client";

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import Panel from "@/components/Panel";
import { EVENT_KIND_LABELS, filterEvents, formatEventTime, groupEventsByDay, type EventsResult, type MarketEvent } from "@/lib/events";
import { formatNewYorkMoment } from "@/lib/market-data";
import { EVENT_FILTERS, type EventFilter } from "@/lib/news";
import { cn } from "@/lib/utils";

const FILTER_LABELS: Record<EventFilter, string> = { all: "All", fed: "Fed", data: "Data" };
const SOURCE_NAMES: Record<MarketEvent["source"], string> = { "Federal Reserve": "Federal Reserve", BLS: "Bureau of Labor Statistics", BEA: "Bureau of Economic Analysis" };

type Props = {
    result: EventsResult;
    filter: EventFilter;
    onFilterChange: (filter: EventFilter) => void;
    now: number;
    // Asks the server again (its copy, so no outside calls unless that copy is 6 hours old)
    onRetry: () => void;
    loading: boolean;
    className?: string;
};

// Upcoming market-moving events from the agencies' own public schedules (lib/events.ts): FOMC decisions and press
// conferences, speeches and testimony by Fed governors, the Beige Book, and the major jobs, inflation and GDP
// releases. Only when things happen; no forecasts or results. Times are New York time.
const UpcomingEvents = ({ className, ...body }: Props) => (
    <Panel title="Upcoming events" description="Fed and economic data schedules · New York time" className={className} bodyClassName="flex min-h-0 flex-col">
        <UpcomingEventsBody {...body} />
    </Panel>
);

// The panel's contents without its frame, for the workspace widget (which has its own title bar)
export const UpcomingEventsBody = ({ result, filter, onFilterChange, now, onRetry, loading }: Omit<Props, "className">) => {
    const groups = useMemo(() => groupEventsByDay(filterEvents(result.events, filter), now), [result.events, filter, now]);
    const failed = result.sources.filter((s) => s.issue);
    const stale = result.sources.filter((s) => !s.issue && s.stale && s.fetchedAt);

    return (
        <>
            <div className="flex items-center justify-between gap-2 border-b border-gray-600 px-4 py-2">
                <div role="radiogroup" aria-label="Show events" className="flex rounded-lg border border-gray-600 p-0.5">
                    {EVENT_FILTERS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={filter === option}
                            onClick={() => onFilterChange(option)}
                            className={cn(
                                "h-6 cursor-pointer rounded-md px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                filter === option ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-100"
                            )}
                        >
                            {FILTER_LABELS[option]}
                        </button>
                    ))}
                </div>
                <span className="text-[11px] text-gray-500">Next 30 days</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto" role="region" aria-label="Upcoming events list" tabIndex={0}>
                {groups.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-400">
                        {failed.length === result.sources.length ? "The schedules couldn't be loaded. Try again later." : "Nothing scheduled in the next 30 days."}
                    </p>
                ) : (
                    groups.map((group) => (
                        <section key={group.day} aria-label={group.label}>
                            <h3 className="border-b border-gray-600/70 bg-gray-900/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</h3>
                            <ul className="divide-y divide-gray-600/70">
                                {group.events.map((event) => (
                                    <EventRow key={event.id} event={event} past={event.timed && event.start < now} />
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </div>

            <footer className="flex flex-col gap-0.5 border-t border-gray-600 px-4 py-2 text-[11px] leading-4 text-gray-500">
                {failed.map((s) => (
                    <p key={s.source} role="status" className="text-gray-300">
                        {SOURCE_NAMES[s.source]} schedule couldn&apos;t be loaded
                        {result.events.some((event) => event.source === s.source) ? "; showing the last copy this page had." : "; its events are missing."}
                    </p>
                ))}
                {failed.length > 0 && (
                    <button
                        type="button"
                        onClick={onRetry}
                        disabled={loading}
                        className="self-start cursor-pointer rounded-sm font-semibold text-gray-100 underline decoration-gray-500 underline-offset-2 hover:decoration-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100 disabled:cursor-default disabled:opacity-60"
                    >
                        {loading ? "Trying again…" : "Try again"}
                    </button>
                )}
                {stale.map((s) => (
                    <p key={s.source}>
                        {SOURCE_NAMES[s.source]} schedule last updated {formatNewYorkMoment(s.fetchedAt!, now)}.
                    </p>
                ))}
                <p>Sources: Federal Reserve Board, BLS, BEA. Schedules can change; forecasts aren&apos;t listed.</p>
            </footer>
        </>
    );
};

const EventRow = ({ event, past }: { event: MarketEvent; past: boolean }) => {
    const note = [event.detail, event.location].filter(Boolean).join(" · ");
    return (
        <li className={cn("flex gap-3 px-4 py-2.5", past && "opacity-60")}>
            <time dateTime={new Date(event.start).toISOString()} className="w-14 shrink-0 pt-px text-xs font-semibold tabular-nums text-gray-100">
                {formatEventTime(event)}
            </time>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {event.format ?? EVENT_KIND_LABELS[event.kind]}
                    {event.source !== "Federal Reserve" && <span className="font-normal normal-case tracking-normal"> · {event.source}</span>}
                    {past && <span className="font-normal normal-case tracking-normal"> · Done</span>}
                </p>
                <p className="text-[13px] font-semibold leading-snug text-gray-100">
                    {event.url ? (
                        <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-sm decoration-gray-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100"
                        >
                            {event.title}
                            <ArrowUpRight aria-hidden className="ml-0.5 inline h-3.5 w-3.5 align-[-2px] text-gray-500" />
                            <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                    ) : (
                        event.title
                    )}
                </p>
                {note && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{note}</p>}
            </div>
        </li>
    );
};

export default UpcomingEvents;
