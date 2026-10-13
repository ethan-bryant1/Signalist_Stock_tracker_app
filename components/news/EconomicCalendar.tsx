"use client";

import { useMemo, useSyncExternalStore } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import { ECONOMIC_CALENDAR_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { CALENDAR_COUNTRIES, CALENDAR_IMPORTANCE_FILTER, type CalendarImportance, type CalendarRegion } from "@/lib/news";
import { cn } from "@/lib/utils";

const IMPORTANCE_LABELS: Record<CalendarImportance, string> = { high: "High", medium: "Medium+", all: "All" };
const REGION_LABELS: Record<CalendarRegion, string> = { us: "US", major: "Major" };

// The viewer's time zone, which TradingView's calendar shows its times in. Blank on the server so the first render
// matches.
const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const Choice = <T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void }) => (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-gray-600 p-0.5">
        {options.map((option) => (
            <button
                key={option}
                type="button"
                role="radio"
                aria-checked={value === option}
                onClick={() => onChange(option)}
                className={cn(
                    "h-6 cursor-pointer rounded-md px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                    value === option ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-100"
                )}
            >
                {labels[option]}
            </button>
        ))}
    </div>
);

type Props = {
    importance: CalendarImportance;
    region: CalendarRegion;
    onChange: (change: { importance?: CalendarImportance; region?: CalendarRegion }) => void;
    className?: string;
};

// TradingView's economic calendar (Finnhub's is a paid endpoint): release time, event, forecast, previous and
// actual figures as TradingView publishes them. Its rows are drawn inside TradingView's frame, which the browser
// doesn't let this page style or read, so only its documented settings change here (importance levels, economies).
// A grayscale filter on our own container turns its blue importance bars, red "now" line and flags gray to match
// the monochrome design; it changes no figures.
const EconomicCalendar = ({ importance, region, onChange, className }: Props) => {
    const zone = useSyncExternalStore(noSubscribe, browserZone, () => "");
    const config = useMemo(
        () => ({ ...ECONOMIC_CALENDAR_WIDGET_CONFIG, importanceFilter: CALENDAR_IMPORTANCE_FILTER[importance], countryFilter: CALENDAR_COUNTRIES[region], height: "100%" }),
        [importance, region]
    );

    return (
        <Panel
            title="Economic calendar"
            description={`TradingView · times in your time zone${zone ? ` (${zone.replace(/_/g, " ")})` : ""}`}
            className={className}
            bodyClassName="flex min-h-0 flex-col"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-600 px-4 py-2">
                <Choice label="Importance" value={importance} options={["high", "medium", "all"] as const} labels={IMPORTANCE_LABELS} onChange={(value) => onChange({ importance: value })} />
                <Choice label="Economies" value={region} options={["us", "major"] as const} labels={REGION_LABELS} onChange={(value) => onChange({ region: value })} />
            </div>
            <div className="min-h-0 flex-1 grayscale">
                <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}events.js`} config={config} height="fill" />
            </div>
        </Panel>
    );
};

export default EconomicCalendar;
