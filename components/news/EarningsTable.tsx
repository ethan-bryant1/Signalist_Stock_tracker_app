"use client";

import { useMemo } from "react";
import Link from "next/link";
import { EARNINGS_HOUR_LABELS, formatCalendarDay, formatEps, formatRevenue, surprise, type EarningsEvent } from "@/lib/news";
import { cn, getChangeColorClass } from "@/lib/utils";

// "+4.2%" for a result's difference from the estimate
const formatSurprise = (value: number | undefined) => (value === undefined ? "" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`);

// A reported figure beside its estimate. Before the report the result reads "Not reported yet"; an estimate is
// never shown in its place.
const Result = ({ actual, estimate, format, label, reported }: { actual?: number; estimate?: number; format: (value: number | undefined) => string; label: string; reported: boolean }) => {
    const diff = surprise(actual, estimate);
    return (
        <span className="flex flex-col items-end tabular-nums" aria-label={`${label}: ${actual !== undefined ? format(actual) : reported ? "not given" : "not reported yet"}, estimate ${format(estimate)}`}>
            <span className={cn("text-sm font-semibold", actual === undefined ? "text-gray-500" : "text-gray-100")}>
                {actual !== undefined ? format(actual) : reported ? "—" : <span className="text-xs font-medium">Not reported yet</span>}
            </span>
            <span className="text-[11px] text-gray-500">
                Est. {format(estimate)}
                {diff !== undefined && <span className={cn("ml-1 font-semibold", getChangeColorClass(diff))}>{formatSurprise(diff)}</span>}
            </span>
        </span>
    );
};

type Props = { events: readonly EarningsEvent[]; today: string; names: Record<string, string> };

// Earnings reports grouped by day: when (before the open, after the close), the quarter, and EPS and revenue
// against the analysts' estimates as Finnhub reports them
const EarningsTable = ({ events, today, names }: Props) => {
    const days = useMemo(() => {
        const groups: { day: string; events: EarningsEvent[] }[] = [];
        for (const event of events) {
            const last = groups.at(-1);
            if (last?.day === event.date) last.events.push(event);
            else groups.push({ day: event.date, events: [event] });
        }
        return groups;
    }, [events]);

    return (
        <div role="region" aria-label="Earnings calendar">
            <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem] gap-x-4 border-b border-gray-600 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:grid">
                <span>Company</span>
                <span className="text-right">When</span>
                <span className="text-right">EPS</span>
                <span className="text-right">Revenue</span>
            </div>
            {days.map(({ day, events: dayEvents }) => (
                <section key={day} aria-label={formatCalendarDay(day)}>
                    <h3 className="sticky top-0 z-[1] flex items-center justify-between border-b border-gray-600 bg-gray-800/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 backdrop-blur">
                        <span>
                            {formatCalendarDay(day)}
                            {day === today && <span className="ml-2 text-gray-100">Today</span>}
                        </span>
                        <span className="tabular-nums">{dayEvents.length} {dayEvents.length === 1 ? "report" : "reports"}</span>
                    </h3>
                    <ul className="divide-y divide-gray-600/70">
                        {dayEvents.map((event) => {
                            // A past day's report without a figure was reported without it, or Finnhub hasn't filled it in
                            const reported = day < today || event.epsActual !== undefined || event.revenueActual !== undefined;
                            return (
                                <li key={`${event.symbol}-${event.date}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-gray-700/40 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem]">
                                    <div className="min-w-0">
                                        <Link href={`/stocks/${encodeURIComponent(event.symbol)}`} className="rounded-sm text-sm font-semibold text-gray-100 hover:underline focus-visible:outline-2 focus-visible:outline-gray-100">
                                            {event.symbol}
                                        </Link>
                                        <p className="truncate text-xs text-gray-500">
                                            {[names[event.symbol], event.period].filter(Boolean).join(" · ")}
                                            <span className="sm:hidden">
                                                {names[event.symbol] || event.period ? " · " : ""}
                                                {EARNINGS_HOUR_LABELS[event.hour]}
                                            </span>
                                        </p>
                                    </div>
                                    <span className="hidden text-right text-xs text-gray-400 sm:block">{EARNINGS_HOUR_LABELS[event.hour]}</span>
                                    <Result label="EPS" actual={event.epsActual} estimate={event.epsEstimate} format={formatEps} reported={reported} />
                                    <span className="col-span-2 sm:col-span-1">
                                        <span className="flex justify-end sm:block">
                                            <Result label="Revenue" actual={event.revenueActual} estimate={event.revenueEstimate} format={formatRevenue} reported={reported} />
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
};

export default EarningsTable;
