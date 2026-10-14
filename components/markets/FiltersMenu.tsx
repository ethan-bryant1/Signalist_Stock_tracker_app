"use client";

import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_FILTERS, activeRanges, type Filters, type RangeKey } from "@/lib/screener";
import { cn } from "@/lib/utils";

const inputClass = "h-8 w-full min-w-0 rounded-lg border border-gray-600 bg-gray-900 px-2 text-xs tabular-nums text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400";

const toNumber = (text: string) => {
    if (text.trim() === "") return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
};

// Minimum and maximum for each figure the native table has (Finnhub's), in the units shown. A stock without the
// figure can't be checked, so the page leaves it out and says how many.
const FiltersMenu = ({ filters, onChange, figuresNote }: { filters: Filters; onChange: (filters: Filters) => void; figuresNote: string }) => {
    const ids = useId();
    const count = activeRanges(filters).length;
    const set = (key: RangeKey, edge: "min" | "max", text: string) => {
        const next = { ...filters[key], [edge]: toNumber(text) };
        const clean = { ...(next.min !== undefined && { min: next.min }), ...(next.max !== undefined && { max: next.max }) };
        const copy = { ...filters };
        if (clean.min === undefined && clean.max === undefined) delete copy[key];
        else copy[key] = clean;
        onChange(copy);
    };

    return (
        <Popover>
            <PopoverTrigger
                title="Filter by price, market cap, P/E and more"
                className={cn(
                    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100",
                    count > 0 ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-100"
                )}
            >
                <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
                Filters
                {count > 0 && <span className="tabular-nums">{count}</span>}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] border border-gray-600 bg-gray-800 p-3 text-gray-100">
                <div role="group" aria-label="Figure filters" className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-x-2 gap-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Figure</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Min</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Max</span>
                    {RANGE_FILTERS.map(({ key, label, unit, hint }) => (
                        <div key={key} className="contents">
                            <span id={`${ids}-${key}`} title={hint} className="truncate text-xs text-gray-100">
                                {label} <span className="text-gray-500">{unit}</span>
                            </span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                aria-label={`${label} minimum (${hint})`}
                                aria-describedby={`${ids}-${key}`}
                                value={filters[key]?.min ?? ""}
                                onChange={(event) => set(key, "min", event.target.value)}
                                placeholder="Any"
                                className={inputClass}
                            />
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                aria-label={`${label} maximum (${hint})`}
                                aria-describedby={`${ids}-${key}`}
                                value={filters[key]?.max ?? ""}
                                onChange={(event) => set(key, "max", event.target.value)}
                                placeholder="Any"
                                className={inputClass}
                            />
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-[11px] text-gray-500">{figuresNote}</p>
                <button
                    type="button"
                    disabled={count === 0}
                    onClick={() => onChange({})}
                    className="mt-3 h-7 w-full cursor-pointer rounded-md border border-gray-600 text-xs font-semibold text-gray-400 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Clear figure filters
                </button>
            </PopoverContent>
        </Popover>
    );
};

export default FiltersMenu;
