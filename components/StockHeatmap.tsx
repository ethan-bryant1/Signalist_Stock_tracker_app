'use client';

import { memo, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import HeatmapCard, { type InspectSource } from "@/components/HeatmapCard";
import { getHeatmapData, type HeatmapStock } from "@/lib/actions/finnhub.actions";
import { MARKET_SECTORS } from "@/lib/data/sp500";
import { ARROW_DIRECTIONS, FULL_COLOR_AT, nearestInDirection, placeBesideRect, placeNearPoint, tileBackground } from "@/lib/heatmap";
import { layoutGroups, type Placed, type TreemapGroup } from "@/lib/treemap";
import { cn, formatChangePercent, formatCurrency, formatMarketCapValue } from "@/lib/utils";

// Prices refresh on the server every two to three minutes; checking each minute shows them soon after
const REFRESH_MS = 60_000;
// Space between sectors, and the height of each sector's name above its stocks
const SECTOR_GAP = 3;
const LABEL_HEIGHT = 18;
const LEGEND_STEPS = [-FULL_COLOR_AT, -2, -1, 0, 1, 2, FULL_COLOR_AT];

const SECTOR_LABELS = new Map<string, string>(MARKET_SECTORS.map(({ value, label }) => [value, label]));

const NEW_YORK_TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

type Inspect = { symbol: string; source: InspectSource };
type Tile = Placed<HeatmapStock>;
type Size = { width: number; height: number };

// A refresh only replaces the figures that came back, so a stock whose price failed to load keeps its last one
const mergeStocks = (previous: HeatmapStock[], next: HeatmapStock[]) => {
    const bySymbol = new Map(previous.map((stock) => [stock.symbol, stock]));
    for (const stock of next) {
        const received = Object.fromEntries(Object.entries(stock).filter(([, value]) => value !== undefined));
        bySymbol.set(stock.symbol, { ...bySymbol.get(stock.symbol), ...received } as HeatmapStock);
    }
    return [...bySymbol.values()];
};

// Keeps the map's figures up to date while the tab is open
const useHeatmapStocks = (initial: HeatmapStock[]) => {
    const [stocks, setStocks] = useState(initial);

    useEffect(() => {
        let cancelled = false;
        let lastRefresh = Date.now();

        const refresh = async () => {
            if (document.visibilityState !== "visible") return;
            lastRefresh = Date.now();
            try {
                const next = await getHeatmapData();
                if (!cancelled && next.length) setStocks((previous) => mergeStocks(previous, next));
            } catch (e) {
                console.error("Couldn't refresh the heatmap", e);
            }
        };

        // Catch up straight away when coming back to a tab that sat in the background
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible" && Date.now() - lastRefresh >= REFRESH_MS) refresh();
        };

        const timer = window.setInterval(refresh, REFRESH_MS);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    return stocks;
};

// The map's size in whole pixels, measured before the browser paints
const useElementSize = (ref: React.RefObject<HTMLElement | null>) => {
    const [size, setSize] = useState<Size | null>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);
            setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return size;
};

// What fits on a tile: nothing on slivers, the ticker on small ones, the ticker and move on the rest
const labelSize = ({ width, height }: Size) =>
    width >= 150 && height >= 100 ? "xl" : width >= 84 && height >= 52 ? "lg" : width >= 46 && height >= 32 ? "md" : width >= 28 && height >= 15 ? "sm" : null;

const TICKER_CLASSES = { xl: "text-2xl", lg: "text-[15px]", md: "text-[11px]", sm: "text-[9px]" } as const;
const MOVE_CLASSES = { xl: "mt-0.5 text-base", lg: "text-xs", md: "text-[10px]" } as const;

// What a screen reader announces for a tile, which also covers the card's main figures
const describeStock = ({ name, symbol, price, currency, changePercent, marketCap, sector }: HeatmapStock) =>
    [
        `${name} (${symbol})`,
        price !== undefined ? formatCurrency(price, currency) : "price unavailable",
        changePercent !== undefined ? `${changePercent > 0 ? "up" : changePercent < 0 ? "down" : "unchanged"} ${Math.abs(changePercent).toFixed(2)}% today` : undefined,
        marketCap ? `market cap ${formatMarketCapValue(marketCap)}` : undefined,
        SECTOR_LABELS.get(sector) ?? sector,
    ].filter(Boolean).join(", ");

// The sector names and stock tiles. Memoized, so moving the mouse between tiles only updates the card;
// the hover outline is plain CSS.
const HeatmapTiles = memo(function HeatmapTiles({
    groups,
    tabbableSymbol,
    selectedSymbol,
    onTileClick,
    onTileFocus,
}: {
    groups: TreemapGroup<HeatmapStock>[];
    tabbableSymbol?: string;
    selectedSymbol?: string;
    onTileClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    onTileFocus: (event: React.FocusEvent<HTMLAnchorElement>) => void;
}) {
    return (
        <>
            {groups.map((group) =>
                group.showLabel ? (
                    <div
                        key={group.key}
                        aria-hidden
                        className="absolute truncate px-1.5 text-[10px] font-semibold uppercase leading-[18px] tracking-[0.14em] text-gray-500"
                        style={{ left: group.rect.x, top: group.rect.y, width: group.rect.width, height: LABEL_HEIGHT }}
                    >
                        {group.label}
                    </div>
                ) : null
            )}
            {groups.flatMap((group) =>
                group.tiles.map(({ item: stock, rect }) => {
                    const size = labelSize(rect);
                    return (
                        <Link
                            key={stock.symbol}
                            href={`/stocks/${stock.symbol}`}
                            prefetch={false}
                            data-symbol={stock.symbol}
                            tabIndex={stock.symbol === tabbableSymbol ? 0 : -1}
                            aria-label={describeStock(stock)}
                            onClick={onTileClick}
                            onFocus={onTileFocus}
                            className={cn(
                                "absolute flex flex-col items-center justify-center overflow-hidden text-center leading-tight text-white outline-none [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]",
                                // A crisp outline in the theme's text color marks the stock being looked at
                                "hover:z-10 hover:shadow-[inset_0_0_0_2px_var(--color-gray-100)] focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--color-gray-100)]",
                                stock.symbol === selectedSymbol && "z-10 shadow-[inset_0_0_0_2px_var(--color-gray-100)]",
                                stock.changePercent === undefined && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.06)_6px_12px)]"
                            )}
                            style={{
                                left: rect.x,
                                top: rect.y,
                                // A pixel less than the box, so the gaps between tiles show as hairlines
                                width: Math.max(rect.width - 1, 0),
                                height: Math.max(rect.height - 1, 0),
                                backgroundColor: tileBackground(stock.changePercent),
                            }}
                        >
                            {size && (
                                <>
                                    <span className={cn("max-w-full truncate px-1 font-semibold tracking-tight", TICKER_CLASSES[size])}>{stock.symbol}</span>
                                    {size !== "sm" && (
                                        <span className={cn("max-w-full truncate px-1 font-medium tabular-nums opacity-90", MOVE_CLASSES[size])}>
                                            {stock.changePercent !== undefined ? formatChangePercent(stock.changePercent) : "—"}
                                        </span>
                                    )}
                                </>
                            )}
                        </Link>
                    );
                })
            )}
        </>
    );
});

// Our own S&P 500 heatmap, so the details card can be designed for this app: it follows the mouse,
// stays inside the window, pins to the bottom of the screen on a tap, and follows the arrow keys.
const StockHeatmap = ({ initial }: { initial: HeatmapStock[] }) => {
    const stocks = useHeatmapStocks(initial);
    const mapRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const size = useElementSize(mapRef);
    const hintId = useId();

    const [inspect, setInspect] = useState<Inspect | null>(null);
    // The tile the keyboard is on, which is also the one Tab lands on
    const [focusSymbol, setFocusSymbol] = useState<string>();
    // Read by event handlers without re-rendering: what's shown, the last cursor spot and how the user last interacted
    const inspectRef = useRef<Inspect | null>(null);
    const pointer = useRef({ x: 0, y: 0 });
    const lastInput = useRef<"mouse" | "pen" | "touch" | "keyboard">("mouse");
    const frame = useRef(0);

    const show = useCallback((next: Inspect | null) => {
        inspectRef.current = next;
        setInspect(next);
    }, []);

    const groups = useMemo(() => {
        if (!size) return [];
        const bySector = new Map<string, HeatmapStock[]>();
        for (const stock of stocks) {
            // A stock is sized by its market cap, so it waits off the map until that loads
            if (!stock.marketCap) continue;
            bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
        }
        return layoutGroups(
            [...bySector].map(([sector, items]) => ({ key: sector, label: SECTOR_LABELS.get(sector) ?? sector, items })),
            (stock) => stock.marketCap ?? 0,
            { x: 0, y: 0, width: size.width, height: size.height },
            { gap: SECTOR_GAP, labelHeight: LABEL_HEIGHT }
        );
    }, [stocks, size]);

    const tiles = useMemo(() => groups.flatMap((group) => group.tiles), [groups]);
    const tileBySymbol = useMemo(() => new Map<string, Tile>(tiles.map((tile) => [tile.item.symbol, tile])), [tiles]);
    const tabbableSymbol = focusSymbol && tileBySymbol.has(focusSymbol) ? focusSymbol : tiles[0]?.item.symbol;
    const inspected = inspect ? tileBySymbol.get(inspect.symbol)?.item : undefined;

    const latest = useMemo(() => stocks.reduce<number | undefined>((max, stock) => (stock.time && stock.time > (max ?? 0) ? stock.time : max), undefined), [stocks]);
    // Counted from the data rather than the tiles, which only exist once the map has been measured
    const mappedCount = useMemo(() => stocks.filter((stock) => stock.marketCap).length, [stocks]);

    // Moves the card with a transform, outside React, so following the mouse costs no re-render
    const positionCard = useCallback(() => {
        frame.current = 0;
        const card = cardRef.current;
        const current = inspectRef.current;
        if (!card || !current || current.source === "touch") return;

        const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
        const box = { width: card.offsetWidth, height: card.offsetHeight };
        let place;
        if (current.source === "pointer") {
            place = placeNearPoint(pointer.current, box, viewport);
        } else {
            const tile = mapRef.current?.querySelector(`[data-symbol="${CSS.escape(current.symbol)}"]`);
            if (!tile) return;
            place = placeBesideRect(tile.getBoundingClientRect(), box, viewport);
        }
        card.style.transform = `translate3d(${Math.round(place.left)}px, ${Math.round(place.top)}px, 0)`;
        card.style.opacity = "1";
    }, []);

    // At most one move per frame, however fast the mouse goes
    const schedulePosition = useCallback(() => {
        if (!frame.current) frame.current = requestAnimationFrame(positionCard);
    }, [positionCard]);

    // A new stock can change the card's height, so place it again before the browser paints
    useLayoutEffect(() => {
        if (!inspect || inspect.source === "touch") return;
        cancelAnimationFrame(frame.current);
        positionCard();
    }, [inspect, inspected, positionCard]);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        // Touch screens use taps instead (onTileClick)
        if (event.pointerType === "touch") return;
        lastInput.current = event.pointerType === "pen" ? "pen" : "mouse";
        pointer.current = { x: event.clientX, y: event.clientY };

        // Over the hairlines between tiles there's no tile, so the card keeps the last stock instead of flickering
        const symbol = (event.target as Element).closest<HTMLElement>("[data-symbol]")?.dataset.symbol;
        const current = inspectRef.current;
        if (symbol && (current?.symbol !== symbol || current.source !== "pointer")) show({ symbol, source: "pointer" });
        else if (current?.source === "pointer") schedulePosition();
    };

    const onPointerLeave = () => {
        if (inspectRef.current?.source === "pointer") show(null);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        lastInput.current = event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse";
    };

    // On a touch screen the first tap shows the stock's details and a second tap (or the card's button) opens it.
    // Mouse and keyboard users open the stock's page straight away, as before.
    const onTileClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
        if (lastInput.current !== "touch") return;
        const symbol = event.currentTarget.dataset.symbol;
        if (!symbol) return;
        const current = inspectRef.current;
        if (current?.source === "touch" && current.symbol === symbol) return;
        event.preventDefault();
        setFocusSymbol(symbol);
        show({ symbol, source: "touch" });
    }, [show]);

    // Keyboard focus shows the card beside the tile; a mouse click's focus doesn't
    const onTileFocus = useCallback((event: React.FocusEvent<HTMLAnchorElement>) => {
        const symbol = event.currentTarget.dataset.symbol;
        if (!symbol) return;
        setFocusSymbol(symbol);
        if (event.currentTarget.matches(":focus-visible")) show({ symbol, source: "keyboard" });
    }, [show]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        lastInput.current = "keyboard";
        if (event.key === "Escape") {
            if (inspectRef.current) {
                event.preventDefault();
                show(null);
            }
            return;
        }

        const direction = ARROW_DIRECTIONS[event.key];
        const from = tabbableSymbol ? tileBySymbol.get(tabbableSymbol) : undefined;
        if (!direction || !from) return;
        // Arrow keys move around the map instead of scrolling the page
        event.preventDefault();
        const next = nearestInDirection(from, tiles, direction);
        if (next) mapRef.current?.querySelector<HTMLElement>(`[data-symbol="${CSS.escape(next.item.symbol)}"]`)?.focus();
    };

    const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && inspectRef.current?.source === "keyboard") show(null);
    };

    // Scrolling moves a different stock under a still cursor, so the hover card hides until the mouse moves.
    // The keyboard card moves with its tile; the tapped card stays docked.
    const onViewportChange = useEffectEvent(() => {
        const current = inspectRef.current;
        if (current?.source === "pointer") show(null);
        else if (current?.source === "keyboard") schedulePosition();
    });

    // A tap anywhere else closes the tapped card
    const onDocumentPointerDown = useEffectEvent((event: PointerEvent) => {
        if (inspectRef.current?.source !== "touch") return;
        const target = event.target as Node;
        if (mapRef.current?.contains(target) || cardRef.current?.contains(target)) return;
        show(null);
    });

    // Typing elsewhere (like Ctrl+K for search) hides the hover card until the mouse moves again
    const onDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
        const source = inspectRef.current?.source;
        if (source === "pointer" || (source === "touch" && event.key === "Escape")) show(null);
    });

    const active = inspect !== null;
    useEffect(() => {
        if (!active) return;
        const viewportChange = () => onViewportChange();
        const pointerDown = (event: PointerEvent) => onDocumentPointerDown(event);
        const keyDown = (event: KeyboardEvent) => onDocumentKeyDown(event);
        window.addEventListener("scroll", viewportChange, { capture: true, passive: true });
        window.addEventListener("resize", viewportChange);
        document.addEventListener("pointerdown", pointerDown);
        document.addEventListener("keydown", keyDown);
        return () => {
            window.removeEventListener("scroll", viewportChange, { capture: true });
            window.removeEventListener("resize", viewportChange);
            document.removeEventListener("pointerdown", pointerDown);
            document.removeEventListener("keydown", keyDown);
        };
    }, [active]);

    return (
        <div className="flex h-[600px] flex-col">
            <div
                ref={mapRef}
                role="group"
                aria-label="Heatmap of the largest S&P 500 companies"
                aria-describedby={hintId}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPointerDown={onPointerDown}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                className="relative min-h-0 flex-1 touch-manipulation overflow-hidden"
            >
                {size && (
                    <HeatmapTiles
                        groups={groups}
                        tabbableSymbol={tabbableSymbol}
                        selectedSymbol={inspect?.source === "touch" ? inspect.symbol : undefined}
                        onTileClick={onTileClick}
                        onTileFocus={onTileFocus}
                    />
                )}
                {/* Until the map is measured in the browser, keep the loading look so tiles don't pop into an empty box */}
                {!size && <div aria-hidden className="absolute inset-0 animate-pulse bg-gray-700/40 motion-reduce:animate-none" />}
                {size && tiles.length === 0 && (
                    <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-500">
                        Prices aren&apos;t available right now. The map fills in as soon as they load.
                    </p>
                )}
            </div>
            <p id={hintId} className="sr-only">Use the arrow keys to move between stocks and Enter to open one.</p>

            <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-gray-600 px-4 text-[11px] text-gray-500">
                <div className="flex items-center gap-px" role="img" aria-label={`Color scale from down ${FULL_COLOR_AT}% or more in red to up ${FULL_COLOR_AT}% or more in green`}>
                    {LEGEND_STEPS.map((step) => (
                        <span
                            key={step}
                            className="flex h-5 w-9 items-center justify-center font-medium tabular-nums text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.3)]"
                            style={{ backgroundColor: tileBackground(step) }}
                        >
                            {step > 0 ? "+" : ""}{step}%
                        </span>
                    ))}
                </div>
                <span className="hidden truncate tabular-nums sm:inline">
                    {mappedCount} stocks{latest ? ` · Prices as of ${NEW_YORK_TIME.format(latest)} ET` : ""}
                </span>
            </div>

            {inspect && inspected && (
                inspect.source === "touch" ? (
                    <div
                        ref={cardRef}
                        role="dialog"
                        aria-label={`${inspected.symbol} details`}
                        className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-sm"
                    >
                        <HeatmapCard stock={inspected} source="touch" onClose={() => show(null)} />
                    </div>
                ) : (
                    // The tile's label already tells screen readers about the stock, so this copy is for the eyes only
                    <div
                        ref={cardRef}
                        aria-hidden
                        className="pointer-events-none fixed left-0 top-0 z-[60] w-72 opacity-0 transition-opacity duration-100 will-change-transform motion-reduce:transition-none"
                    >
                        <HeatmapCard stock={inspected} source={inspect.source} />
                    </div>
                )
            )}
        </div>
    );
};

export default StockHeatmap;
