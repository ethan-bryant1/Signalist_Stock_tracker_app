'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import HeatmapTerminal from "@/components/HeatmapTerminal";
import { useLiveMarket } from "@/components/LiveMarket";
import SectorPerformance from "@/components/SectorPerformance";
import { useNow } from "@/hooks/useHeatmapFeed";
import {
    EXTENDED_HOURS_OPTIONS,
    GROUP_OPTIONS,
    PERIOD_OPTIONS,
    SIZE_OPTIONS,
    parseHeatmapState,
    serializeHeatmapState,
    type HeatmapState,
    type Option,
} from "@/lib/heatmap-state";
import type { MarketSession } from "@/lib/market-data";
import { cn } from "@/lib/utils";

// A row of buttons where one is selected, like a trading platform's toolbar
const Segmented = <T extends string>({
    label,
    options,
    value,
    onChange,
    className,
}: {
    className?: string;
    label: string;
    options: Option<T>[];
    value?: T;
    onChange: (value: T) => void;
}) => (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-1.5", className)}>
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
                            "h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 text-xs font-semibold tabular-nums transition-colors",
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

const ToolButton = ({ onClick, pressed, title, children }: { onClick?: () => void; pressed?: boolean; title: string; children: React.ReactNode }) => (
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
// Only this page's own frame in full screen counts (not a video elsewhere). iPhones have no Fullscreen API, so
// document.fullscreenElement is undefined there, which must read as "not in full screen".
const frameIsFullscreen = () => !!document.fullscreenElement?.hasAttribute("data-heatmap-frame");
// Unknown (null) until the browser answers, so the server's HTML keeps room for the button and nothing jumps
const fullscreenSupported = () => !!document.fullscreenEnabled;
const fullscreenUnknown = () => null;

const describe = (options: Option<string>[], value: string) => options.find((option) => option.value === value)?.description ?? value;

const SESSION_TEXT: Record<MarketSession, string> = {
    "pre-market": "in pre-market trading",
    regular: "in its regular session",
    "post-market": "in after-hours trading",
    closed: "closed",
};

// The S&P 500 Heatmap page: TradingView's map of every S&P 500 company, set from our toolbar (TradingView's
// documented blockColor, blockSize and grouping values), with the sector funds beside it. The map is a sealed frame
// from TradingView: its data, calculations and hover card are TradingView's, and a click on a stock opens its Loops
// Watch page through the widget's symbolUrl setting. It costs no Finnhub requests; the sector list reads the
// header's shared prices. The settings live in the address bar, so Back from a stock's page returns to the same map.
const SP500Heatmap = ({ initialState, initialNow }: { initialState: HeatmapState; initialNow: number }) => {
    // The settings start from the address bar as the browser has it. After Back from a stock's page, Next restores the
    // server's first render of this page, whose initialState is from before any clicks; the address bar has the rest.
    const searchParams = useSearchParams();
    const [state, setState] = useState(() => parseHeatmapState(searchParams));
    // A link to this page while it's open (like the Heatmap tab in the menu) renders it again with new settings
    const [renderedState, setRenderedState] = useState(initialState);
    if (initialState !== renderedState) {
        setRenderedState(initialState);
        setState(initialState);
    }
    const [showMapControls, setShowMapControls] = useState(false);
    const { session } = useLiveMarket();
    const now = useNow(initialNow);

    const frameRef = useRef<HTMLDivElement>(null);
    const canFullscreen = useSyncExternalStore(subscribeToFullscreen, fullscreenSupported, fullscreenUnknown);
    const isFullscreen = useSyncExternalStore(subscribeToFullscreen, frameIsFullscreen, () => false);

    // The address bar follows the settings, without adding history entries for every click. A plain replaceState (no
    // state of our own) lets Next keep its router in step, so Back from a stock's page comes back to this address.
    useEffect(() => {
        const url = `${window.location.pathname}${serializeHeatmapState(state)}${window.location.hash}`;
        if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            window.history.replaceState(null, "", url);
        }
    }, [state]);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else frameRef.current?.requestFullscreen().catch(() => {});
    };

    const extended = state.color === "premarket" || state.color === "postmarket";
    const mapHeight = isFullscreen ? "min-h-0 flex-1" : "h-[560px] sm:h-[620px] lg:h-[700px] xl:h-[760px]";

    return (
        <div
            ref={frameRef}
            data-heatmap-frame
            className={cn(
                "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]",
                isFullscreen && "h-screen w-screen items-stretch gap-3 overflow-y-auto bg-gray-900 p-3 xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden"
            )}
        >
            <section aria-labelledby="heatmap-title" className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-800", isFullscreen && "min-h-[80vh] xl:min-h-0")}>
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-gray-600 px-4 py-3">
                    <div className="min-w-0">
                        <h2 id="heatmap-title" className="text-base font-semibold text-gray-100">{showMapControls ? "TradingView heatmap" : "S&P 500"}</h2>
                        <p className="mt-0.5 text-xs text-gray-500">
                            {showMapControls
                                ? "Pick the index in TradingView's bar above the map · data and calculations by TradingView, delayed"
                                : "Every S&P 500 company · data and calculations by TradingView, delayed · FactSet sectors"}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <ToolButton onClick={() => setShowMapControls((value) => !value)} pressed={showMapControls} title="Show TradingView's own bar, which can switch the map to another index such as the Nasdaq 100">
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            More options
                        </ToolButton>
                        {canFullscreen !== false && (
                            // Hidden, but holding its place, until the browser says whether it supports full screen
                            <span className={cn("contents", canFullscreen === null && "[&>button]:invisible")} aria-hidden={canFullscreen === null || undefined}>
                                <ToolButton onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}>
                                    {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                    <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
                                </ToolButton>
                            </span>
                        )}
                    </div>
                </header>

                <div className="flex flex-wrap gap-x-5 gap-y-3 border-b border-gray-600 px-4 py-3">
                    <Segmented className="order-1" label="Performance" options={PERIOD_OPTIONS} value={extended ? undefined : state.color} onChange={(color) => setState((previous) => ({ ...previous, color }))} />
                    <Segmented className="order-2" label="Extended hours" options={EXTENDED_HOURS_OPTIONS} value={extended ? state.color : undefined} onChange={(color) => setState((previous) => ({ ...previous, color }))} />
                    <Segmented className="order-4 sm:order-3" label="Size by" options={SIZE_OPTIONS} value={state.size} onChange={(size) => setState((previous) => ({ ...previous, size }))} />
                    <Segmented className="order-3 sm:order-4" label="Group" options={GROUP_OPTIONS} value={state.group} onChange={(group) => setState((previous) => ({ ...previous, group }))} />
                </div>

                <div className={cn("relative", mapHeight)}>
                    <HeatmapTerminal color={state.color} size={state.size} group={state.group} showMapControls={showMapControls} className="h-full" />
                </div>

                <p className="border-t border-gray-600 px-4 py-2.5 text-xs leading-relaxed text-gray-500">
                    Colored by {describe([...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS], state.color)}, sized by {describe(SIZE_OPTIONS, state.size)}, as
                    TradingView calculates them (delayed). {extended ? `The US market is ${SESSION_TEXT[session]} now. ` : ""}
                    Sectors are FactSet&apos;s, so they don&apos;t match the GICS sectors in the list. Hover for TradingView&apos;s card; a click opens the
                    stock here.
                </p>
            </section>

            <SectorPerformance now={now} className={cn(isFullscreen && "xl:overflow-y-auto")} />
        </div>
    );
};

export default SP500Heatmap;
