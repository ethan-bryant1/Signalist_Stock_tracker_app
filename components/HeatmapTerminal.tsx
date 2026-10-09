'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import { HEATMAP_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string; description: string };

// What the block colors show. The values are TradingView's names for each measure.
const PERFORMANCE_OPTIONS: Option[] = [
    { value: "change|60", label: "1H", description: "1-hour change" },
    { value: "change|240", label: "4H", description: "4-hour change" },
    { value: "change", label: "1D", description: "1-day change" },
    { value: "Perf.W", label: "1W", description: "1-week performance" },
    { value: "Perf.1M", label: "1M", description: "1-month performance" },
    { value: "Perf.3M", label: "3M", description: "3-month performance" },
    { value: "Perf.6M", label: "6M", description: "6-month performance" },
    { value: "Perf.YTD", label: "YTD", description: "year-to-date performance" },
    { value: "Perf.Y", label: "1Y", description: "1-year performance" },
];

const EXTENDED_HOURS_OPTIONS: Option[] = [
    { value: "premarket_change", label: "Pre-market", description: "pre-market change" },
    { value: "postmarket_change", label: "After hours", description: "after-hours change" },
];

// What the block sizes show
const SIZE_OPTIONS: Option[] = [
    { value: "market_cap_basic", label: "Market cap", description: "market cap" },
    { value: "volume", label: "Volume", description: "shares traded today" },
    { value: "Value.Traded", label: "Dollar volume", description: "dollars traded today" },
];

const GROUP_OPTIONS: Option[] = [
    { value: "sector", label: "Sectors", description: "grouped by sector" },
    { value: "no_group", label: "None", description: "ungrouped" },
];

const describe = (options: Option[], value: string) => options.find((option) => option.value === value)?.description;

// A row of buttons where one is selected, like a trading platform's toolbar
const Segmented = ({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (value: string) => void }) => (
    <div className="flex min-w-0 max-w-full flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</span>
        <div role="group" aria-label={label} className="flex w-fit max-w-full overflow-x-auto scrollbar-hide rounded-lg border border-gray-600 bg-gray-900 p-0.5">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        title={option.description[0].toUpperCase() + option.description.slice(1)}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 text-xs sm:px-2.5 font-semibold tabular-nums transition-colors",
                            active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    </div>
);

const ToolButton = ({ onClick, pressed, title, children }: { onClick: () => void; pressed?: boolean; title: string; children: React.ReactNode }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        title={title}
        className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors",
            pressed ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-100"
        )}
    >
        {children}
    </button>
);

const subscribeToFullscreen = (onChange: () => void) => {
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
};

// The S&P 500 heatmap with a toolbar to pick what the colors and sizes show, and a full screen mode
const HeatmapTerminal = () => {
    const [color, setColor] = useState("change");
    const [size, setSize] = useState("market_cap_basic");
    const [grouping, setGrouping] = useState("sector");
    // TradingView's own controls, which can switch the map to another index such as the Nasdaq 100
    const [showMapControls, setShowMapControls] = useState(false);

    const frameRef = useRef<HTMLElement | null>(null);
    // Phones like the iPhone can't show part of a page full screen, so the button only appears where it works
    const canFullscreen = useSyncExternalStore(subscribeToFullscreen, () => document.fullscreenEnabled, () => false);
    const isFullscreen = useSyncExternalStore(subscribeToFullscreen, () => document.fullscreenElement !== null, () => false);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else frameRef.current?.requestFullscreen().catch(() => {});
    };

    // Rebuilt only when a setting changes, since every new config reloads the map
    const config = useMemo(() => ({
        ...HEATMAP_PAGE_WIDGET_CONFIG,
        blockColor: color,
        blockSize: size,
        grouping,
        hasTopBar: showMapControls,
        isDataSetEnabled: showMapControls,
    }), [color, size, grouping, showMapControls]);

    const containerRef = useTradingViewWidget(`${TRADINGVIEW_SCRIPT_URL}stock-heatmap.js`, config);

    const summary = showMapControls
        ? "Use the bar above the map to switch to another index, such as the Nasdaq 100"
        : `Sized by ${describe(SIZE_OPTIONS, size)} · Colored by ${describe([...PERFORMANCE_OPTIONS, ...EXTENDED_HOURS_OPTIONS], color)} · ${describe(GROUP_OPTIONS, grouping)}`;

    return (
        <section
            ref={frameRef}
            aria-labelledby="heatmap-title"
            className={cn(
                "flex min-w-0 flex-col overflow-hidden bg-gray-800",
                isFullscreen ? "h-screen w-screen" : "rounded-xl border border-gray-600"
            )}
        >
            <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-600 px-4 py-3">
                <div className="min-w-0">
                    <h2 id="heatmap-title" className="text-base font-semibold text-gray-100">S&amp;P 500</h2>
                    <p className="mt-0.5 text-xs text-gray-500">{summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <ToolButton
                        onClick={() => setShowMapControls((value) => !value)}
                        pressed={showMapControls}
                        title="Show the map's own controls, to switch to another index such as the Nasdaq 100"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        More options
                    </ToolButton>
                    {canFullscreen && (
                        <ToolButton onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}>
                            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                            {isFullscreen ? "Exit full screen" : "Full screen"}
                        </ToolButton>
                    )}
                </div>
            </header>

            <div className="flex flex-wrap gap-x-6 gap-y-3 border-b border-gray-600 px-4 py-3">
                <Segmented label="Performance" options={PERFORMANCE_OPTIONS} value={color} onChange={setColor} />
                <Segmented label="Extended hours" options={EXTENDED_HOURS_OPTIONS} value={color} onChange={setColor} />
                <Segmented label="Size by" options={SIZE_OPTIONS} value={size} onChange={setSize} />
                <Segmented label="Group" options={GROUP_OPTIONS} value={grouping} onChange={setGrouping} />
            </div>

            <div className={cn(isFullscreen ? "min-h-0 flex-1" : "h-[520px] sm:h-[640px] lg:h-[720px]")}>
                <div ref={containerRef} className="tradingview-widget-container h-full rounded-none!" />
            </div>

            <p className="hidden border-t border-gray-600 px-4 py-2.5 text-xs text-gray-500 md:block">
                Hover a stock for its details, scroll to zoom in, and click to open its page.
            </p>
        </section>
    );
};

export default HeatmapTerminal;
