"use client";

import { useMemo, useSyncExternalStore } from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import { ECONOMIC_CALENDAR_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { CALENDAR_COUNTRIES, CALENDAR_IMPORTANCE_FILTER, type CalendarImportance, type CalendarRegion } from "@/lib/news";
import { cn } from "@/lib/utils";

const IMPORTANCE_LABELS: Record<CalendarImportance, string> = { high: "High", medium: "Medium+", all: "All" };
const REGION_LABELS: Record<CalendarRegion, string> = { us: "US", major: "Major economies" };

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
};

// The News page's Economic calendar tab: TradingView's free calendar (Finnhub's is a paid endpoint) with each
// release's time, importance, actual, forecast and previous figures, units included, as TradingView publishes them.
// It gets the full width of the news column so its rows aren't cramped. Its rows are drawn inside TradingView's
// frame, which the browser doesn't let this page style or read, so only its documented settings change here
// (importance levels, economies); a grayscale filter on our own container keeps its colored marks monochrome.
const EconomicCalendar = ({ importance, region, onChange }: Props) => {
    const zone = useSyncExternalStore(noSubscribe, browserZone, () => "");
    const config = useMemo(
        () => ({ ...ECONOMIC_CALENDAR_WIDGET_CONFIG, importanceFilter: CALENDAR_IMPORTANCE_FILTER[importance], countryFilter: CALENDAR_COUNTRIES[region], height: "100%" }),
        [importance, region]
    );

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-600 px-3 py-2">
                <Choice label="Importance" value={importance} options={["high", "medium", "all"] as const} labels={IMPORTANCE_LABELS} onChange={(value) => onChange({ importance: value })} />
                <Choice label="Economies" value={region} options={["us", "major"] as const} labels={REGION_LABELS} onChange={(value) => onChange({ region: value })} />
                <p className="basis-full text-[11px] text-gray-500 sm:ml-auto sm:basis-auto">
                    TradingView · actual, forecast and previous · times in your time zone{zone ? ` (${zone.replace(/_/g, " ")})` : ""}
                </p>
            </div>
            <div className="h-[70dvh] min-h-[32rem] grayscale">
                <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}events.js`} config={config} height="fill" />
            </div>
        </>
    );
};

export default EconomicCalendar;
