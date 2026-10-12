'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronRight, Maximize2, Minimize2, Settings2, SlidersHorizontal } from "lucide-react";
import HeatmapTerminal from "@/components/HeatmapTerminal";
import { HeatmapLegend, HeatmapStatus } from "@/components/HeatmapFooter";
import { useLiveMarket } from "@/components/LiveMarket";
import SectorPerformance from "@/components/SectorPerformance";
import StockHeatmap, { unplacedStocks } from "@/components/StockHeatmap";
import StockInspector from "@/components/StockInspector";
import { useHeatmapFeed, useNow } from "@/hooks/useHeatmapFeed";
import { useHeatmapSettings } from "@/hooks/useHeatmapSettings";
import { HEATMAP_LINK_VALUES, HEATMAP_SYMBOLS, HEATMAP_UNIVERSE } from "@/lib/data/heatmap";
import {
    EXTENDED_HOURS_OPTIONS,
    GROUP_OPTIONS,
    INTERACTIVE_SUPPORTS,
    PERIOD_OPTIONS,
    SIZE_OPTIONS,
    focusSector,
    interactiveSettings,
    parseHeatmapState,
    selectStock,
    serializeHeatmapState,
    type HeatmapState,
    type HeatmapView,
    type Option,
} from "@/lib/heatmap-state";
import { assessStocks, capWeightedChange, periodPhrase, type HeatmapPayload, type MarketSession } from "@/lib/market-data";
import { cn, formatChangePercent, getChangeColorClass } from "@/lib/utils";

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

// From the xl breakpoint up, the selected stock's panel sits beside the map instead of in a bottom sheet
const WIDE_QUERY = "(min-width: 1280px)";

const VIEW_OPTIONS: { value: HeatmapView; label: string; title: string }[] = [
    { value: "interactive", label: `Interactive · ${HEATMAP_SYMBOLS.length}`, title: `Our map of ${HEATMAP_SYMBOLS.length} ${HEATMAP_UNIVERSE.description}: hover, select and focus sectors` },
    { value: "tradingview", label: "Full S&P 500", title: "TradingView's map of every S&P 500 company, with more periods and sizes (delayed data)" },
];

const describe = (options: Option<string>[], value: string) => options.find((option) => option.value === value)?.description ?? value;

// What the interactive map shows instead when the chosen period or size needs TradingView's map, naming only the
// settings that fell back
const fallbackText = (state: HeatmapState) => {
    const effective = interactiveSettings(state);
    const unsupported = [
        effective.colorFellBack ? describe([...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS], state.color) : undefined,
        effective.sizeFellBack ? describe(SIZE_OPTIONS, state.size) : undefined,
    ].filter(Boolean);
    return `Showing ${describe(PERIOD_OPTIONS, effective.color)} sized by ${describe(SIZE_OPTIONS, effective.size)}: ${unsupported.join(" and ")} ${unsupported.length > 1 ? "need" : "needs"} the Full S&P 500 view.`;
};

const SESSION_TEXT: Record<MarketSession, string> = {
    "pre-market": "in pre-market trading",
    regular: "in its regular session",
    "post-market": "in after-hours trading",
    closed: "closed",
};

// The settings that change how the map looks for this viewer (not what it shows), remembered in this browser
const SettingsPopover = ({ container }: { container: React.RefObject<HTMLElement | null> }) => {
    const [settings, update] = useHeatmapSettings();
    const choice = (active: boolean) =>
        cn(
            "h-7 flex-1 cursor-pointer rounded-md px-2 text-xs font-semibold transition-colors",
            active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
        );
    return (
        <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger
                title="Display settings"
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100 data-[popup-open]:border-gray-100 data-[popup-open]:text-gray-100"
            >
                <Settings2 className="h-3.5 w-3.5" />
                Display
            </PopoverPrimitive.Trigger>
            {/* "contents" keeps the portal's wrapper out of the page grid it's placed in */}
            <PopoverPrimitive.Portal container={container} className="contents">
                <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={6} className="z-[70]">
                    <PopoverPrimitive.Popup className="w-72 rounded-lg border border-gray-600 bg-gray-900 p-3 text-xs text-gray-400 shadow-2xl shadow-black/40 outline-none">
                        <PopoverPrimitive.Title className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Display</PopoverPrimitive.Title>
                        <p className="mt-3 font-medium text-gray-100">Colors</p>
                        <div role="group" aria-label="Colors" className="mt-1.5 flex gap-0.5 rounded-lg border border-gray-600 bg-gray-800 p-0.5">
                            <button type="button" aria-pressed={settings.palette === "classic"} onClick={() => update({ palette: "classic" })} className={choice(settings.palette === "classic")}>
                                Green / red
                            </button>
                            <button type="button" aria-pressed={settings.palette === "cvd"} onClick={() => update({ palette: "cvd" })} className={choice(settings.palette === "cvd")}>
                                Blue / orange
                            </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-500">Blue and orange stay distinct for red-green color blindness. The scale is the same.</p>
                        <p className="mt-3 font-medium text-gray-100">Logos on large tiles</p>
                        <div role="group" aria-label="Logos on large tiles" className="mt-1.5 flex gap-0.5 rounded-lg border border-gray-600 bg-gray-800 p-0.5">
                            <button type="button" aria-pressed={settings.logos} onClick={() => update({ logos: true })} className={choice(settings.logos)}>
                                Show
                            </button>
                            <button type="button" aria-pressed={!settings.logos} onClick={() => update({ logos: false })} className={choice(!settings.logos)}>
                                Hide
                            </button>
                        </div>
                        <p className="mt-3 border-t border-gray-600 pt-2 text-[11px] text-gray-500">Also used by the dashboard&apos;s heatmap. Tickers and changes always show where they fit in full.</p>
                    </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
};

type HeatmapWorkspaceProps = {
    initial: HeatmapPayload;
    initialState: HeatmapState;
    watchlist: string[];
};

// The Heatmap page. Two views share one toolbar and the Sector ETFs list:
// - Interactive (default): our map of the 54 stocks with live Finnhub prices. Hover for a quick look, click to
//   select a stock (its panel stays while you look around), and focus a sector from its heading or the list.
// - Full S&P 500: TradingView's map, with every constituent and the periods, after-hours and volume sizing that
//   Finnhub's free plan can't back. It's a sealed frame, so it has no selection or sector linking.
// The view and its settings live in the address bar, so Back from a stock's page returns to the same view.
const HeatmapWorkspace = ({ initial, initialState, watchlist: initialWatchlist }: HeatmapWorkspaceProps) => {
    // The view starts from the address bar as the browser has it. After Back from a stock's page, Next restores the
    // server's first render of this page, whose initialState is from before any clicks; the address bar has the rest.
    const searchParams = useSearchParams();
    const [state, setState] = useState(() => parseHeatmapState(searchParams, HEATMAP_LINK_VALUES));
    // A link to this page while it's open (like the Heatmap tab in the menu) renders it again with new settings
    const [renderedState, setRenderedState] = useState(initialState);
    if (initialState !== renderedState) {
        setRenderedState(initialState);
        setState(initialState);
    }
    const [showMapControls, setShowMapControls] = useState(false);
    const [highlight, setHighlight] = useState<string>();
    const [watchlist, setWatchlist] = useState(() => new Set(initialWatchlist));

    const { session } = useLiveMarket();
    // Trades stream in only while the regular session trades; otherwise prices refresh once a minute
    const feed = useHeatmapFeed(initial, { stream: session === "regular" });
    const now = useNow(initial.generatedAt);
    const [settings] = useHeatmapSettings();

    const frameRef = useRef<HTMLDivElement>(null);
    const sheetHeadingRef = useRef<HTMLHeadingElement>(null);
    const mapWrapRef = useRef<HTMLDivElement>(null);
    const liveId = useId();
    const [announcement, setAnnouncement] = useState("");
    // Which side the tablet-sized details panel docks to: away from the selected tile, so it doesn't cover it
    const [sheetSide, setSheetSide] = useState<"left" | "right">("right");

    const canFullscreen = useSyncExternalStore(subscribeToFullscreen, fullscreenSupported, fullscreenUnknown);
    const isFullscreen = useSyncExternalStore(subscribeToFullscreen, frameIsFullscreen, () => false);

    const interactive = state.view === "interactive";
    const effective = interactiveSettings(state);

    // The address bar follows the view, without adding history entries for every click. A plain replaceState (no
    // state of our own) lets Next keep its router in step, so Back from a stock's page comes back to this address.
    useEffect(() => {
        const url = `${window.location.pathname}${serializeHeatmapState(state)}${window.location.hash}`;
        if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            window.history.replaceState(null, "", url);
        }
    }, [state]);

    // Says something to screen readers. Cleared first, so the same words said twice are announced twice.
    const announce = useCallback((text: string) => {
        setAnnouncement("");
        requestAnimationFrame(() => setAnnouncement(text));
    }, []);

    // When the control that had keyboard focus goes away (a button that only shows in one state), focus moves to
    // the map's current stock, or the given fallback, instead of being lost to the page
    const keepFocus = useCallback((fallback?: () => HTMLElement | null | undefined) => {
        requestAnimationFrame(() => {
            if (document.activeElement && document.activeElement !== document.body) return;
            const target = fallback?.() ?? mapWrapRef.current?.querySelector<HTMLElement>('[data-symbol][tabindex="0"]');
            target?.focus({ preventScroll: true });
        });
    }, []);

    const change = useCallback((next: (previous: HeatmapState) => HeatmapState) => {
        setState(next);
    }, []);

    const assessment = useMemo(() => assessStocks(feed.stocks, { now, session }), [feed.stocks, now, session]);
    const mapStocks = useMemo(() => (state.sector ? feed.stocks.filter((stock) => stock.sector === state.sector) : feed.stocks), [feed.stocks, state.sector]);
    const unplaced = useMemo(() => unplacedStocks(mapStocks, effective.size), [mapStocks, effective.size]);
    // Current prices only, so the figure never mixes today's moves with a stale stock's earlier one
    const summary = useMemo(() => capWeightedChange(mapStocks, assessment.freshness), [mapStocks, assessment.freshness]);
    // The status line counts the stocks on the map, which is one sector's while a sector is focused
    const mapAssessment = useMemo(() => {
        if (!state.sector) return assessment;
        const statuses = mapStocks.map((stock) => assessment.freshness.get(stock.symbol) ?? "missing");
        return {
            ...assessment,
            priced: statuses.filter((status) => status !== "missing").length,
            stale: statuses.filter((status) => status === "stale").length,
            missing: statuses.filter((status) => status === "missing").length,
        };
    }, [assessment, mapStocks, state.sector]);
    const selected = state.symbol ? feed.stocks.find((stock) => stock.symbol === state.symbol) : undefined;

    const onSelect = useCallback(
        (symbol: string) => {
            const tile = mapWrapRef.current?.querySelector(`[data-symbol="${CSS.escape(symbol)}"]`)?.getBoundingClientRect();
            if (tile) setSheetSide(tile.left + tile.width / 2 > window.innerWidth / 2 ? "left" : "right");
            change((previous) => selectStock(previous, symbol));
            announce(`${symbol} selected. Its details are in the selected stock panel.`);
            // On a narrow screen the details open in a bottom sheet, and focus moves into it so keyboards and screen
            // readers land on them (Esc returns to the map). On wide screens the panel sits beside the map and
            // focus stays on the map.
            requestAnimationFrame(() => {
                if (!window.matchMedia(WIDE_QUERY).matches) sheetHeadingRef.current?.focus({ preventScroll: true });
            });
        },
        [change, announce]
    );

    const clearSelection = useCallback(() => {
        const symbol = state.symbol;
        change((previous) => selectStock(previous, undefined));
        announce("Selection cleared.");
        // From the panel or sheet, back to the tile the details were for, so keyboard users keep their place on the
        // map. Focus already on the map stays where it is.
        if (symbol && !mapWrapRef.current?.contains(document.activeElement)) {
            requestAnimationFrame(() => {
                const tile = mapWrapRef.current?.querySelector<HTMLElement>(`[data-symbol="${CSS.escape(symbol)}"]`);
                (tile ?? mapWrapRef.current?.querySelector<HTMLElement>('[data-symbol][tabindex="0"]'))?.focus({ preventScroll: true });
            });
        }
    }, [change, announce, state.symbol]);

    const onFocusSector = useCallback(
        (sector?: string) => {
            change((previous) => focusSector(previous, sector));
            setHighlight(undefined);
            announce(sector ? `Showing ${sector} only.` : "Showing all sectors.");
            keepFocus();
        },
        [change, announce, keepFocus]
    );

    const viewToggleRef = useRef<HTMLDivElement>(null);
    const switchView = (view: HeatmapView) => {
        change((previous) => ({ ...previous, view }));
        const next = { ...state, view };
        const fell = interactiveSettings(next);
        if (view === "interactive" && (fell.colorFellBack || fell.sizeFellBack)) announce(fallbackText(next));
        keepFocus(() => viewToggleRef.current?.querySelector<HTMLElement>(`[data-view="${view}"]`));
    };

    const onWatchlistChange = useCallback((symbol: string, added: boolean) => {
        setWatchlist((previous) => {
            const next = new Set(previous);
            if (added) next.add(symbol);
            else next.delete(symbol);
            return next;
        });
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else frameRef.current?.requestFullscreen().catch(() => {});
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Escape clears the selection (the map's own Escape, for its hover card, comes first). In full screen the
        // browser uses Escape to leave full screen, which comes before the page sees it.
        if (event.key === "Escape" && state.symbol && interactive) {
            event.preventDefault();
            clearSelection();
        }
    };

    // The interactive view offers only what Finnhub's free plan can back: today's move, sized by market cap or
    // equally. Every period, extended hours and volume are in the Full S&P 500 view.
    const periodOptions = interactive ? PERIOD_OPTIONS.filter((option) => INTERACTIVE_SUPPORTS.color.has(option.value)) : PERIOD_OPTIONS;
    const sizeOptions = interactive ? SIZE_OPTIONS.filter((option) => INTERACTIVE_SUPPORTS.size.has(option.value)) : SIZE_OPTIONS;

    const shownColor = interactive ? effective.color : state.color;
    const shownSize = interactive ? effective.size : state.size;
    const fellBack = interactive && (effective.colorFellBack || effective.sizeFellBack);

    const title = interactive ? "S&P 500 sector leaders" : showMapControls ? "TradingView heatmap" : "S&P 500";
    const subtitle = interactive
        ? `${HEATMAP_SYMBOLS.length} ${HEATMAP_UNIVERSE.description} · GICS sectors · prices from Finnhub`
        : showMapControls
            ? "Pick the index in TradingView's bar above the map · data and calculations by TradingView, delayed"
            : "Every S&P 500 company · data and calculations by TradingView, delayed · FactSet sectors";

    const period = assessment.period;
    const mapHeight = isFullscreen ? "min-h-0 flex-1" : "h-[560px] sm:h-[620px] lg:h-[700px] xl:h-[760px]";

    return (
        <div
            ref={frameRef}
            data-heatmap-frame
            data-heat-palette={settings.palette}
            onKeyDown={onKeyDown}
            className={cn(
                // Each column keeps its own height, so selecting a stock (which grows the side column) never resizes the map
                "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]",
                isFullscreen && "h-screen w-screen items-stretch gap-3 overflow-y-auto bg-gray-900 p-3 xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden"
            )}
        >
            <section aria-labelledby="heatmap-title" className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-800", isFullscreen && "min-h-[80vh] xl:min-h-0")}>
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-gray-600 px-4 py-3">
                    <div className="min-w-0">
                        <h2 id="heatmap-title" className="text-base font-semibold text-gray-100">{title}</h2>
                        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div ref={viewToggleRef} role="group" aria-label="Map" className="flex rounded-lg border border-gray-600 bg-gray-900 p-0.5">
                            {VIEW_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    data-view={option.value}
                                    aria-pressed={state.view === option.value}
                                    title={option.title}
                                    onClick={() => switchView(option.value)}
                                    className={cn(
                                        "h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors",
                                        state.view === option.value ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {interactive ? (
                            <SettingsPopover container={frameRef} />
                        ) : (
                            <ToolButton onClick={() => setShowMapControls((value) => !value)} pressed={showMapControls} title="Show TradingView's own bar, which can switch the map to another index such as the Nasdaq 100">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                More options
                            </ToolButton>
                        )}
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
                    <Segmented
                        className="order-1"
                        label="Performance"
                        options={periodOptions}
                        value={PERIOD_OPTIONS.some((option) => option.value === shownColor) ? shownColor : undefined}
                        onChange={(color) => change((previous) => ({ ...previous, color }))}
                    />
                    {!interactive && (
                        <Segmented
                            className="order-2"
                            label="Extended hours"
                            options={EXTENDED_HOURS_OPTIONS}
                            value={EXTENDED_HOURS_OPTIONS.some((option) => option.value === shownColor) ? shownColor : undefined}
                            onChange={(color) => change((previous) => ({ ...previous, color }))}
                        />
                    )}
                    <Segmented className="order-4 sm:order-3" label="Size by" options={sizeOptions} value={shownSize} onChange={(size) => change((previous) => ({ ...previous, size }))} />
                    <Segmented className="order-3 sm:order-4" label="Group" options={GROUP_OPTIONS} value={state.group} onChange={(group) => change((previous) => ({ ...previous, group }))} />
                </div>

                {/* Screen readers hear this through the page's announcement, not as a live region added already filled */}
                {fellBack && (
                    <div data-heatmap-notice className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-gray-600 bg-gray-900/40 px-4 py-2 text-xs text-gray-400">
                        <span>{fallbackText(state)}</span>
                        <button
                            type="button"
                            onClick={() => switchView("tradingview")}
                            className="shrink-0 cursor-pointer font-semibold text-gray-100 underline-offset-2 hover:underline"
                        >
                            Open the Full S&amp;P 500 view
                        </button>
                    </div>
                )}

                {interactive && (
                    <nav aria-label="Map scope" className="flex min-h-9 items-center justify-between gap-3 border-b border-gray-600 px-4 py-1.5 text-xs">
                        <ol className="flex min-w-0 items-center gap-1.5">
                            <li>
                                {/* Stays a button in both states, so keyboard focus isn't lost when it's used */}
                                <button
                                    type="button"
                                    aria-current={state.sector ? undefined : "page"}
                                    onClick={() => state.sector && onFocusSector(undefined)}
                                    className={cn(
                                        "font-medium transition-colors",
                                        state.sector ? "cursor-pointer text-gray-400 hover:text-gray-100" : "cursor-default font-semibold text-gray-100"
                                    )}
                                >
                                    All sectors
                                </button>
                            </li>
                            {state.sector && (
                                <li className="flex min-w-0 items-center gap-1.5">
                                    <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                    <span aria-current="page" className="truncate font-semibold text-gray-100">{state.sector}</span>
                                </li>
                            )}
                        </ol>
                        <span
                            className="flex shrink-0 items-center gap-1.5 tabular-nums text-gray-500"
                            title={`Market-cap-weighted 1-day change of the ${summary.counted} stocks on the map with current prices${summary.stale ? `; ${summary.stale} with stale prices left out` : ""}`}
                        >
                            <span className="hidden sm:inline">Map stocks combined</span>
                            <span className="sm:hidden">Combined</span>
                            <span className={cn("font-semibold", getChangeColorClass(summary.changePercent))}>
                                {summary.changePercent !== undefined ? formatChangePercent(summary.changePercent) : "—"}
                            </span>
                            {summary.stale > 0 && <span className="text-[11px]">({summary.stale} stale left out)</span>}
                        </span>
                    </nav>
                )}

                <div ref={mapWrapRef} className={cn("relative", mapHeight)}>
                    {interactive ? (
                        <StockHeatmap
                            stocks={mapStocks}
                            freshness={assessment.freshness}
                            now={now}
                            sizeBy={effective.size}
                            groupBy={state.group}
                            action="select"
                            showLogos={settings.logos}
                            periodText={periodPhrase(period)}
                            label={`Heatmap of ${state.sector ? `${state.sector} stocks among ` : ""}${HEATMAP_SYMBOLS.length} ${HEATMAP_UNIVERSE.description}`}
                            selectedSymbol={state.symbol}
                            highlightSector={state.sector ? undefined : highlight}
                            onSelect={onSelect}
                            onFocusSector={state.sector ? undefined : onFocusSector}
                            emptyMessage={feed.issue === "not-configured" ? "Prices are unavailable: the server has no Finnhub API key." : undefined}
                            noCapHint="Size by Equal shows them."
                            className="h-full"
                        />
                    ) : (
                        <HeatmapTerminal color={state.color} size={state.size} group={state.group} showMapControls={showMapControls} className="h-full" />
                    )}
                </div>

                {interactive ? (
                    <div className="flex shrink-0 flex-col gap-1.5 border-t border-gray-600 px-4 py-2 md:flex-row md:items-center md:justify-between md:gap-4">
                        <HeatmapLegend palette={settings.palette} />
                        <HeatmapStatus feed={feed} assessment={mapAssessment} stocks={mapStocks} unplaced={unplaced} now={now} className="md:justify-end md:text-right" />
                    </div>
                ) : (
                    <p className="border-t border-gray-600 px-4 py-2.5 text-xs leading-relaxed text-gray-500">
                        Colored by {describe([...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS], state.color)}, sized by {describe(SIZE_OPTIONS, state.size)}, as TradingView
                        calculates them (delayed). {state.color === "premarket" || state.color === "postmarket" ? `The US market is ${SESSION_TEXT[session]} now. ` : ""}
                        Sectors are FactSet&apos;s, so they don&apos;t match the GICS sectors in the list. Hover for TradingView&apos;s card; a click opens the
                        stock here.
                    </p>
                )}
            </section>

            <aside aria-label="Selected stock and sectors" className={cn("flex min-w-0 flex-col gap-6", isFullscreen && "gap-3 xl:overflow-y-auto")}>
                {interactive && (
                    <section aria-label="Selected stock" className="hidden rounded-xl border border-gray-600 bg-gray-800 p-4 xl:block">
                        {selected ? (
                            <StockInspector
                                stock={selected}
                                freshness={assessment.freshness.get(selected.symbol) ?? "missing"}
                                now={now}
                                watchlisted={watchlist.has(selected.symbol)}
                                focusedSector={state.sector}
                                onClose={clearSelection}
                                onFocusSector={onFocusSector}
                                onWatchlistChange={onWatchlistChange}
                            />
                        ) : (
                            <div className="text-xs text-gray-500">
                                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Selected stock</h3>
                                <p className="mt-2 leading-relaxed">Click a stock to keep its quote here while you look around the map. Esc clears it.</p>
                            </div>
                        )}
                    </section>
                )}
                <SectorPerformance
                    stocks={feed.stocks}
                    freshness={assessment.freshness}
                    focusedSector={interactive ? state.sector : undefined}
                    onFocusSector={onFocusSector}
                    onHighlight={interactive ? setHighlight : () => {}}
                    tradingViewShown={!interactive}
                    now={now}
                />
            </aside>

            {/* Below the xl breakpoint the selected stock's details open as a sheet over the bottom of the screen.
                It doesn't block the page: tapping another stock switches to it, and Esc or the close button dismisses it. */}
            {interactive && selected && (
                <div
                    role="dialog"
                    aria-modal="false"
                    aria-label={`${selected.symbol} details`}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border border-b-0 border-gray-600 bg-gray-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/50 xl:hidden",
                        // Phones: a sheet across the bottom. Tablets: a panel docked to the corner away from the selected tile.
                        "sm:bottom-3 sm:w-[22rem] sm:rounded-2xl sm:border-b",
                        sheetSide === "left" ? "sm:left-3 sm:right-auto" : "sm:left-auto sm:right-3"
                    )}
                >
                    <div aria-hidden className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-gray-600 sm:hidden" />
                    <StockInspector
                        stock={selected}
                        freshness={assessment.freshness.get(selected.symbol) ?? "missing"}
                        now={now}
                        watchlisted={watchlist.has(selected.symbol)}
                        focusedSector={state.sector}
                        onClose={clearSelection}
                        onFocusSector={onFocusSector}
                        onWatchlistChange={onWatchlistChange}
                        headingRef={sheetHeadingRef}
                    />
                </div>
            )}

            <p id={liveId} aria-live="polite" className="sr-only">{announcement}</p>
        </div>
    );
};

export default HeatmapWorkspace;
