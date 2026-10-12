'use client';

import { memo, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import HeatmapCard, { type InspectSource } from "@/components/HeatmapCard";
import { useTextMeasure } from "@/hooks/useTextMeasure";
import { SECTOR_BY_NAME } from "@/lib/data/markets";
import {
    ARROW_DIRECTIONS,
    FULL_COLOR_AT,
    HEADING_FONT_SIZE,
    LINE_HEIGHT,
    fitHeading,
    fitTileContent,
    nearestInDirection,
    placeBesideRect,
    placeNearPoint,
    tileBackground,
    type TileContent,
} from "@/lib/heatmap";
import { quotePeriodPhrase, type Freshness, type HeatmapStock } from "@/lib/market-data";
import { layoutGroups, type Placed, type Rect, type TreemapGroup } from "@/lib/treemap";
import { volumeSize } from "@/lib/period-change";
import { cn, formatChangePercent, formatCurrency, formatMarketCapValue } from "@/lib/utils";

// Space between sectors, and the height of each sector's name above its stocks. A name that can be clicked gets a
// strip 24px tall, the smallest comfortable touch target, since the stocks start right below it.
const SECTOR_GAP = 3;
const LABEL_HEIGHT = 18;
const INTERACTIVE_LABEL_HEIGHT = 24;

export type SizeMetric = "cap" | "equal" | "volume" | "dollar-volume";

type Inspect = { symbol: string; source: InspectSource };
type Tile = Placed<HeatmapStock>;
type Size = { width: number; height: number };

// The stocks a market-cap map can't place because Finnhub sent no market cap for them. They're listed under
// the map rather than drawn at a made-up size.
export const unplacedStocks = (stocks: readonly HeatmapStock[], sizeBy: SizeMetric) =>
    sizeBy === "equal" ? [] : stocks.filter((stock) => !sizeValue(stock, sizeBy));

// What a stock's tile is sized by, or undefined when that figure is missing
const sizeValue = (stock: HeatmapStock, sizeBy: SizeMetric) =>
    sizeBy === "equal" ? 1 : sizeBy === "cap" ? stock.marketCap : volumeSize(stock, sizeBy === "dollar-volume");

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

const FRESHNESS_TEXT: Record<Freshness, string> = { fresh: "", stale: "price may be out of date", missing: "price unavailable" };

// What a screen reader announces for a tile, which covers the hover card's figures. The change is described by
// the stock's own price time, so a stock that hasn't refreshed yet isn't said to have moved "today".
const describeStock = (stock: HeatmapStock, freshness: Freshness, periodText: string, now: number, fixedPeriod = false) => {
    const { name, symbol, quote, marketCap, sector } = stock;
    const change = quote?.changePercent;
    const rounded = change !== undefined ? Math.round(change * 100) / 100 : undefined;
    const when = fixedPeriod ? periodText : quotePeriodPhrase(quote?.time, now, periodText);
    return [
        `${name} (${symbol})`,
        quote ? formatCurrency(quote.price) : undefined,
        rounded !== undefined ? `${rounded > 0 ? "up" : rounded < 0 ? "down" : "unchanged"} ${Math.abs(rounded).toFixed(2)}% ${when}` : undefined,
        marketCap ? `market cap ${formatMarketCapValue(marketCap)}` : undefined,
        sector,
        FRESHNESS_TEXT[freshness] || undefined,
    ].filter(Boolean).join(", ");
};

// Diagonal stripes over a tile whose price is old or missing, so it never passes for a current price. They're dark,
// so the white text over them only gains contrast (tests/heatmap-colors.test.ts checks the striped colors too).
// Keep these in step with the patterns below (Tailwind needs the classes written out in full).
export const STALE_STRIPE_ALPHA = 0.3;
export const MISSING_STRIPE_ALPHA = 0.26;
const FRESHNESS_PATTERN: Record<Freshness, string | undefined> = {
    fresh: undefined,
    stale: "bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgb(0_0_0/0.3)_5px_7px)]",
    missing: "bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(0_0_0/0.26)_4px_8px)]",
};

// A logo on a tile. It stays invisible until it has loaded (so no empty white square shows while it loads) and
// is left out, not replaced by initials, when it fails, since the ticker is right below it.
const TileLogo = ({ src, size }: { src: string; size: number }) => {
    const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
    if (state === "failed") return null;
    return (
        <span
            className={cn("mb-[5px] flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] p-[3px]", state === "loaded" ? "bg-white" : "opacity-0")}
            style={{ width: size, height: size }}
        >
            <Image src={src} alt="" width={size} height={size} unoptimized loading="eager" onLoad={() => setState("loaded")} onError={() => setState("failed")} className="h-full w-full object-contain" />
        </span>
    );
};

type TileProps = {
    stock: HeatmapStock;
    rect: Rect;
    content: TileContent | null;
    freshness: Freshness;
    tabbable: boolean;
    selected: boolean;
    action: "open" | "select";
    showLogo: boolean;
    label: string;
    // The change that gets the full color (lib/heatmap.ts uses FULL_COLOR_AT, the 1-day scale)
    fullColorAt: number;
    onLinkClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

// Layout and label fitting make new objects on every refresh, so tiles compare them by value
const sameRect = (a: Rect, b: Rect) => a === b || (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
const sameContent = (a: TileContent | null, b: TileContent | null) =>
    a === b || (!!a && !!b && a.logo === b.logo && a.tickerSize === b.tickerSize && a.valueSize === b.valueSize);
const sameTile = (a: TileProps, b: TileProps) =>
    a.stock === b.stock && sameRect(a.rect, b.rect) && sameContent(a.content, b.content) && a.freshness === b.freshness && a.tabbable === b.tabbable
    && a.selected === b.selected && a.action === b.action && a.showLogo === b.showLogo && a.label === b.label && a.fullColorAt === b.fullColorAt
    && a.onLinkClick === b.onLinkClick;

// One stock's rectangle. Memoized, so a quote refresh or a moving cursor only redraws the tiles that changed.
const HeatmapTile = memo(function HeatmapTile({ stock, rect, content, freshness, tabbable, selected, action, showLogo, label, fullColorAt, onLinkClick }: TileProps) {
    const change = stock.quote?.changePercent;
    const value = change !== undefined ? formatChangePercent(change) : "—";
    const className = cn(
        "absolute flex flex-col items-center justify-center overflow-hidden whitespace-nowrap text-center text-white outline-none [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]",
        // A crisp outline in the theme's text color marks the stock under the cursor or keyboard
        "hover:z-10 hover:shadow-[inset_0_0_0_2px_var(--color-gray-100)] focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--color-gray-100),inset_0_0_0_3px_var(--color-gray-900)]",
        action === "select" ? "cursor-pointer" : undefined,
        FRESHNESS_PATTERN[freshness]
    );
    const style: React.CSSProperties = {
        left: rect.x,
        top: rect.y,
        // A pixel less than the box, so the gaps between tiles show as hairlines
        width: Math.max(rect.width - 1, 0),
        height: Math.max(rect.height - 1, 0),
        backgroundColor: tileBackground(freshness === "missing" || change === undefined ? undefined : (change * FULL_COLOR_AT) / fullColorAt),
    };
    const body = content && (
        <>
            {content.logo > 0 && showLogo && stock.logo && <TileLogo src={stock.logo} size={content.logo} />}
            <span className="font-semibold" style={{ fontSize: content.tickerSize, lineHeight: LINE_HEIGHT }}>{stock.symbol}</span>
            {content.valueSize > 0 && (
                <span className="mt-px font-medium tabular-nums opacity-95" style={{ fontSize: content.valueSize, lineHeight: LINE_HEIGHT }}>{value}</span>
            )}
        </>
    );

    if (action === "open") {
        return (
            <Link
                href={`/stocks/${encodeURIComponent(stock.symbol)}`}
                prefetch={false}
                data-symbol={stock.symbol}
                tabIndex={tabbable ? 0 : -1}
                aria-label={label}
                onClick={onLinkClick}
                className={className}
                style={style}
            >
                {body}
            </Link>
        );
    }
    return (
        <button type="button" data-symbol={stock.symbol} tabIndex={tabbable ? 0 : -1} aria-label={label} aria-current={selected || undefined} className={className} style={style}>
            {body}
        </button>
    );
}, sameTile);

type HeadingProps = {
    group: TreemapGroup<HeatmapStock>;
    text: string | null;
    height: number;
    // Clicking a heading zooms into that sector: on the Heatmap page in place, from the dashboard by opening that page
    onFocusSector?: (sector: string) => void;
    sectorHref?: (sector: string) => string;
};

const sameHeading = (a: HeadingProps, b: HeadingProps) =>
    a.group.key === b.group.key && a.group.label === b.group.label && sameRect(a.group.rect, b.group.rect) && a.text === b.text && a.height === b.height
    && a.onFocusSector === b.onFocusSector && a.sectorHref === b.sectorHref;

const SectorHeading = memo(function SectorHeading({ group, text, height, onFocusSector, sectorHref }: HeadingProps) {
    const style: React.CSSProperties = { left: group.rect.x, top: group.rect.y, width: group.rect.width, height, fontSize: HEADING_FONT_SIZE };
    const className = "absolute flex items-center overflow-hidden whitespace-nowrap px-1.5 font-semibold uppercase tracking-[0.08em] text-gray-500";
    const interactive = "cursor-pointer rounded-sm text-left transition-colors hover:bg-gray-700/70 hover:text-gray-100";
    // Sectors can also be focused from the Sector ETFs list and the selected stock's panel, so headings stay out of
    // the Tab order and the map remains one stop for keyboard users
    if (onFocusSector) {
        return (
            <button type="button" tabIndex={-1} title={`Focus ${group.label}`} aria-label={`Focus ${group.label}`} onClick={() => onFocusSector(group.key)} className={cn(className, interactive)} style={style}>
                {text}
            </button>
        );
    }
    if (sectorHref) {
        return (
            <Link href={sectorHref(group.key)} prefetch={false} tabIndex={-1} title={`Open ${group.label} on the Heatmap page`} className={cn(className, interactive)} style={style}>
                {text}
            </Link>
        );
    }
    return <div aria-hidden title={group.label} className={className} style={style}>{text}</div>;
}, sameHeading);

type TileLayerProps = {
    groups: TreemapGroup<HeatmapStock>[];
    tiles: Tile[];
    contents: ReadonlyMap<string, TileContent | null>;
    headings: ReadonlyMap<string, string | null>;
    labels: ReadonlyMap<string, string>;
    freshness: ReadonlyMap<string, Freshness>;
    tabbableSymbol?: string;
    selectedSymbol?: string;
    headingHeight: number;
    action: "open" | "select";
    showLogos: boolean;
    fullColorAt: number;
    onLinkClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    onFocusSector?: (sector: string) => void;
    sectorHref?: (sector: string) => string;
};

// All the headings and tiles. Memoized as a whole, so moving the cursor (which only changes the card) skips them.
// Tiles are in the DOM in the order they were given (not their place on the map), so a refresh that moves a tile
// never re-inserts it, which would take keyboard focus off it. Their positions are absolute anyway.
const TileLayer = memo(function TileLayer({ groups, tiles, contents, headings, labels, freshness, tabbableSymbol, selectedSymbol, headingHeight, action, showLogos, fullColorAt, onLinkClick, onFocusSector, sectorHref }: TileLayerProps) {
    return (
        <>
            {groups.map((group) =>
                group.showLabel ? (
                    <SectorHeading key={`heading-${group.key}`} group={group} text={headings.get(group.key) ?? null} height={headingHeight} onFocusSector={onFocusSector} sectorHref={sectorHref} />
                ) : null
            )}
            {tiles.map(({ item: stock, rect }) => (
                <HeatmapTile
                    key={stock.symbol}
                    stock={stock}
                    rect={rect}
                    content={contents.get(stock.symbol) ?? null}
                    freshness={freshness.get(stock.symbol) ?? "missing"}
                    tabbable={stock.symbol === tabbableSymbol}
                    selected={stock.symbol === selectedSymbol}
                    action={action}
                    showLogo={showLogos}
                    fullColorAt={fullColorAt}
                    label={labels.get(stock.symbol) ?? stock.symbol}
                    onLinkClick={onLinkClick}
                />
            ))}
        </>
    );
});

type StockHeatmapProps = {
    stocks: readonly HeatmapStock[];
    freshness: ReadonlyMap<string, Freshness>;
    now: number;
    sizeBy: SizeMetric;
    groupBy: "sector" | "none";
    // What clicking a stock does: open its page (the dashboard) or select it (the Heatmap page)
    action: "open" | "select";
    showLogos: boolean;
    // The change that gets the full color: 3% for the 1-day map, more for longer periods
    fullColorAt?: number;
    // How a screen reader describes the period of the change, like "today"
    periodText: string;
    // For a longer period than one day: its short name for the hover card ("1W"), and the screen reader's
    // wording is then periodText for every stock, not each quote's own day
    changeLabel?: string;
    // The map's accessible name
    label: string;
    selectedSymbol?: string;
    // A sector to spotlight (from hovering its row in the Sector ETFs list)
    highlightSector?: string;
    onSelect?: (symbol: string) => void;
    onFocusSector?: (sector: string) => void;
    sectorHref?: (sector: string) => string;
    // Overrides what an empty map says (like when the server has no API key)
    emptyMessage?: string;
    // Added when a market-cap map has stocks but none with a market cap, like "Size by Equal shows them."
    noCapHint?: string;
    className?: string;
};

// The stock heatmap shared by the dashboard and the Heatmap page: squarified rectangles sized by market cap
// (or equally), grouped by sector, colored by the 1-day change on one fixed scale (lib/heatmap.ts).
// Hovering shows a small quote card that follows the mouse, stays inside the window and never covers the cursor.
// The arrow keys move between stocks; on a touch screen a tap docks the card at the bottom of the screen.
const StockHeatmap = ({
    stocks,
    freshness,
    now,
    sizeBy,
    groupBy,
    action,
    showLogos,
    fullColorAt = FULL_COLOR_AT,
    periodText,
    changeLabel,
    label,
    selectedSymbol,
    highlightSector,
    onSelect,
    onFocusSector,
    sectorHref,
    emptyMessage,
    noCapHint,
    className,
}: StockHeatmapProps) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const size = useElementSize(mapRef);
    const measure = useTextMeasure(mapRef);
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

    const labelHeight = onFocusSector || sectorHref ? INTERACTIVE_LABEL_HEIGHT : LABEL_HEIGHT;
    const groups = useMemo(() => {
        if (!size) return [];
        const valueOf = (stock: HeatmapStock) => sizeValue(stock, sizeBy) ?? 0;
        // Biggest first, so equal-size tiles still read in market-cap order like the market-cap map
        const order = sizeBy === "equal" ? (stock: HeatmapStock) => stock.marketCap ?? 0 : valueOf;
        const ordered = [...stocks].sort((a, b) => order(b) - order(a));
        const box = { x: 0, y: 0, width: size.width, height: size.height };
        if (groupBy === "none") {
            return layoutGroups([{ key: "all", label: "All stocks", items: ordered }], valueOf, box);
        }
        const bySector = new Map<string, HeatmapStock[]>();
        for (const stock of ordered) {
            const sector = bySector.get(stock.sector);
            if (sector) sector.push(stock);
            else bySector.set(stock.sector, [stock]);
        }
        return layoutGroups(
            [...bySector].map(([sector, items]) => ({ key: sector, label: sector, items })),
            valueOf,
            box,
            { gap: SECTOR_GAP, labelHeight }
        );
    }, [stocks, size, sizeBy, groupBy, labelHeight]);

    // In the order the stocks were given, which stays the same from one refresh to the next
    const tiles = useMemo(() => {
        const order = new Map(stocks.map((stock, index) => [stock.symbol, index]));
        return groups.flatMap((group) => group.tiles).sort((a, b) => (order.get(a.item.symbol) ?? 0) - (order.get(b.item.symbol) ?? 0));
    }, [groups, stocks]);
    const tileBySymbol = useMemo(() => new Map<string, Tile>(tiles.map((tile) => [tile.item.symbol, tile])), [tiles]);
    const tabbableSymbol = focusSymbol && tileBySymbol.has(focusSymbol) ? focusSymbol : tiles[0]?.item.symbol;

    // What fits on each tile, from its measured size and the measured width of its text
    const contents = useMemo(() => {
        const result = new Map<string, TileContent | null>();
        for (const { item, rect } of tiles) {
            const change = item.quote?.changePercent;
            result.set(
                item.symbol,
                fitTileContent({ width: rect.width - 1, height: rect.height - 1 }, item.symbol, change !== undefined ? formatChangePercent(change) : "—", measure, {
                    logo: showLogos && !!item.logo,
                })
            );
        }
        return result;
    }, [tiles, measure, showLogos]);

    const headings = useMemo(
        () =>
            new Map(
                groups.map((group) => {
                    const names = SECTOR_BY_NAME.get(group.key);
                    return [group.key, group.showLabel ? fitHeading(group.rect.width, { full: group.label, short: names?.short ?? group.label }, measure) : null];
                })
            ),
        [groups, measure]
    );

    const labels = useMemo(
        () => new Map(tiles.map(({ item }) => [item.symbol, describeStock(item, freshness.get(item.symbol) ?? "missing", periodText, now, !!changeLabel)])),
        [tiles, freshness, periodText, now, changeLabel]
    );

    // The card shows nothing for a stock that has left the map (a refresh or filter), and never stands in for the
    // selected stock, whose panel already shows it
    const inspectedTile = inspect ? tileBySymbol.get(inspect.symbol) : undefined;
    const shown = inspect && inspectedTile && !(action === "select" && inspect.symbol === selectedSymbol) ? inspect : null;
    const inspected = shown ? inspectedTile?.item : undefined;
    const selectedTile = selectedSymbol ? tileBySymbol.get(selectedSymbol) : undefined;
    const highlightGroup = highlightSector ? groups.find((group) => group.key === highlightSector) : undefined;

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
        if (!shown || shown.source === "touch") return;
        cancelAnimationFrame(frame.current);
        positionCard();
    }, [shown, inspected, positionCard]);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    // Shows the card for a stock, except the selected one
    const quickLook = useCallback(
        (symbol: string, source: InspectSource) => {
            if (action === "select" && symbol === selectedSymbol) {
                if (inspectRef.current) show(null);
                return;
            }
            const current = inspectRef.current;
            if (current?.symbol !== symbol || current.source !== source) show({ symbol, source });
            else if (source === "pointer") schedulePosition();
        },
        [action, selectedSymbol, show, schedulePosition]
    );

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        // Touch screens use taps instead
        if (event.pointerType === "touch") return;
        lastInput.current = event.pointerType === "pen" ? "pen" : "mouse";
        pointer.current = { x: event.clientX, y: event.clientY };

        // Over the hairlines between tiles there's no tile, so the card keeps the last stock instead of flickering.
        // Over a sector name it hides, since a click there opens the sector, not the stock.
        const target = event.target as Element;
        const symbol = target.closest<HTMLElement>("[data-symbol]")?.dataset.symbol;
        if (symbol) quickLook(symbol, "pointer");
        else if (inspectRef.current?.source === "pointer") {
            if (target.closest("a, button")) show(null);
            else schedulePosition();
        }
    };

    const onPointerLeave = () => {
        if (inspectRef.current?.source === "pointer") show(null);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        lastInput.current = event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse";
    };

    // Dashboard, touch screen: the first tap shows the stock's details and a second tap (or the card's button)
    // opens it. Mouse and keyboard users open the stock's page straight away.
    const onLinkClick = useCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (lastInput.current !== "touch") return;
            const symbol = event.currentTarget.dataset.symbol;
            if (!symbol) return;
            const current = inspectRef.current;
            if (current?.source === "touch" && current.symbol === symbol) return;
            event.preventDefault();
            setFocusSymbol(symbol);
            show({ symbol, source: "touch" });
        },
        [show]
    );

    // Heatmap page: a click, tap, Enter or Space selects the stock
    const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (action !== "select") return;
        const symbol = (event.target as Element).closest<HTMLElement>("button[data-symbol]")?.dataset.symbol;
        if (!symbol) return;
        setFocusSymbol(symbol);
        if (inspectRef.current) show(null);
        onSelect?.(symbol);
    };

    // Keyboard focus shows the card beside the tile; a mouse click's focus doesn't
    const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        const symbol = target.dataset.symbol;
        if (!symbol) return;
        setFocusSymbol(symbol);
        if (target.matches(":focus-visible")) quickLook(symbol, "keyboard");
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        lastInput.current = "keyboard";
        if (event.key === "Escape") {
            // The first Escape closes the quick look; the next one reaches the page (which clears the selection)
            if (inspectRef.current) {
                event.preventDefault();
                event.stopPropagation();
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

    // Why the map is empty: no stocks, nothing from Finnhub yet, or (sizing by market cap) no market caps
    const anyPriced = stocks.some((stock) => stock.quote);
    const emptyText =
        emptyMessage ??
        (stocks.length === 0
            ? "No stocks to show."
            : sizeBy !== "equal" && anyPriced
                ? `Finnhub sent no ${sizeBy === "cap" ? "market caps" : "trading volumes"} for these stocks, so the map can't size them.${noCapHint ? ` ${noCapHint}` : ""}`
                : "No prices or market caps from Finnhub right now. The map fills in as soon as they load.");

    const hint =
        action === "select"
            ? "Use the arrow keys to move between stocks, and Enter to select one."
            : "Use the arrow keys to move between stocks, and Enter to open one.";

    return (
        <>
            <div
                ref={mapRef}
                role="group"
                aria-label={label}
                aria-describedby={hintId}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPointerDown={onPointerDown}
                onClick={onClick}
                onFocus={onFocus}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                className={cn("relative touch-manipulation select-none overflow-hidden", className)}
            >
                {size && (
                    <TileLayer
                        groups={groups}
                        tiles={tiles}
                        contents={contents}
                        headings={headings}
                        labels={labels}
                        freshness={freshness}
                        tabbableSymbol={tabbableSymbol}
                        selectedSymbol={action === "select" ? selectedSymbol : undefined}
                        headingHeight={labelHeight}
                        action={action}
                        showLogos={showLogos}
                        fullColorAt={fullColorAt}
                        onLinkClick={onLinkClick}
                        onFocusSector={onFocusSector}
                        sectorHref={sectorHref}
                    />
                )}

                {/* The sector being pointed at in the Sector ETFs list stays bright while the rest of the map dims */}
                {highlightGroup && (
                    <div
                        aria-hidden
                        className="pointer-events-none absolute z-20 shadow-[inset_0_0_0_1px_var(--color-gray-100)]"
                        style={{
                            left: highlightGroup.rect.x - 1,
                            top: highlightGroup.rect.y - 1,
                            width: highlightGroup.rect.width + 2,
                            height: highlightGroup.rect.height + 2,
                            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--color-gray-900) 55%, transparent), inset 0 0 0 1px var(--color-gray-100)",
                        }}
                    />
                )}
                {/* The selected stock keeps a heavier outline wherever the cursor goes */}
                {selectedTile && (
                    <div
                        aria-hidden
                        data-selected-outline
                        className="pointer-events-none absolute z-30 shadow-[inset_0_0_0_2px_var(--color-gray-100),inset_0_0_0_4px_var(--color-gray-900)]"
                        style={{
                            left: selectedTile.rect.x,
                            top: selectedTile.rect.y,
                            width: Math.max(selectedTile.rect.width - 1, 0),
                            height: Math.max(selectedTile.rect.height - 1, 0),
                        }}
                    />
                )}

                {/* Until the map is measured in the browser, keep the loading look so tiles don't pop into an empty box */}
                {!size && <div aria-hidden className="absolute inset-0 animate-pulse bg-gray-700/40 motion-reduce:animate-none" />}
                {size && tiles.length === 0 && (
                    <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-500">{emptyText}</p>
                )}
            </div>
            <p id={hintId} className="sr-only">{hint}</p>

            {shown && inspected && (
                shown.source === "touch" ? (
                    <div
                        // A new key when the card switches between docked and floating, so React never reuses one as the other
                        key="touch-card"
                        ref={cardRef}
                        role="dialog"
                        aria-label={`${inspected.symbol} details`}
                        className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-sm"
                    >
                        <HeatmapCard
                            stock={inspected}
                            freshness={freshness.get(inspected.symbol) ?? "missing"}
                            now={now}
                            source="touch"
                            action={action}
                            changeLabel={changeLabel}
                            onClose={() => show(null)}
                        />
                    </div>
                ) : (
                    // The tile's label already tells screen readers about the stock, so this copy is for the eyes only
                    <div
                        key="hover-card"
                        ref={cardRef}
                        aria-hidden
                        data-heatmap-hud
                        className="pointer-events-none fixed left-0 top-0 z-[60] w-64 opacity-0 transition-opacity duration-100 will-change-transform motion-reduce:transition-none"
                    >
                        <HeatmapCard
                            stock={inspected}
                            freshness={freshness.get(inspected.symbol) ?? "missing"}
                            now={now}
                            source={shown.source}
                            action={action}
                            changeLabel={changeLabel}
                        />
                    </div>
                )
            )}
        </>
    );
};

export default StockHeatmap;
