// Pure helpers for the stock heatmap (components/StockHeatmap.tsx): tile colors, what fits on a tile, where the
// details card goes, and which tile the arrow keys move to

import type { Placed, Rect } from "@/lib/treemap";

// ---------- Colors ----------
//
// One scale for every tile, legend and figure on our heatmaps:
// - Moves smaller than ±0.05% are flat gray, since they round to nothing on screen.
// - Above that, the tile mixes from gray toward green (up) or red (down) in proportion to the move,
//   reaching the full color at ±3%. Larger moves stay at the full color, so one big outlier can't
//   wash out the rest of the map the way a scale stretched to the biggest move would.
// - The colors live in app/globals.css (--heat-flat, --heat-up, --heat-down), one set per theme, plus a
//   color-blind-safe blue and orange set. White text passes the WCAG 4.5:1 contrast rule on every shade
//   (checked by tests/heatmap-colors.test.ts).

export const FULL_COLOR_AT = 3;
export const NEUTRAL_BAND = 0.05;

// How strongly a move is colored, from -1 (full red) to 1 (full green); 0 is flat; undefined when there's no figure
export const heatStrength = (changePercent?: number) => {
    if (changePercent === undefined || !Number.isFinite(changePercent)) return undefined;
    if (Math.abs(changePercent) < NEUTRAL_BAND) return 0;
    return Math.max(-1, Math.min(1, changePercent / FULL_COLOR_AT));
};

// A tile's background, as a CSS color
export const tileBackground = (changePercent?: number) => {
    const strength = heatStrength(changePercent);
    if (!strength) return "var(--heat-flat)";
    const percent = Math.round(Math.abs(strength) * 100);
    return `color-mix(in oklab, ${strength > 0 ? "var(--heat-up)" : "var(--heat-down)"} ${percent}%, var(--heat-flat))`;
};

// The numbers printed under the legend
export const LEGEND_TICKS = [-3, -2, -1, 0, 1, 2, 3] as const;

// The legend bar: the same mix as the tiles, drawn as a gradient from -3% to +3%
export const legendGradient = () => {
    const stops = [];
    for (let step = -FULL_COLOR_AT; step <= FULL_COLOR_AT; step += 0.5) {
        stops.push(`${tileBackground(step)} ${(((step + FULL_COLOR_AT) / (2 * FULL_COLOR_AT)) * 100).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(", ")})`;
};

// The palettes a viewer can pick in the heatmap settings
export type HeatPalette = "classic" | "cvd";

// ---------- What fits on a tile ----------
//
// Each tile shows as much as fits in full, from the biggest option down:
// logo, ticker and change → ticker and change → ticker → nothing (the color alone).
// Text is measured, never cut off with "…", and a logo is only shown where it is big enough to recognize.

export type Measure = (text: string, fontSize: number, weight: 500 | 600) => number;

export type TileContent = {
    // Logo size in pixels, or 0 for none
    logo: number;
    tickerSize: number;
    // Font size of the percent change, or 0 to leave it out
    valueSize: number;
};

const TILE_TIERS: TileContent[] = [
    { logo: 28, tickerSize: 20, valueSize: 14 },
    { logo: 0, tickerSize: 22, valueSize: 15 },
    { logo: 0, tickerSize: 16, valueSize: 12 },
    { logo: 0, tickerSize: 13, valueSize: 11 },
    { logo: 0, tickerSize: 11, valueSize: 10 },
    { logo: 0, tickerSize: 11, valueSize: 0 },
    { logo: 0, tickerSize: 9, valueSize: 0 },
];

// Space kept clear inside a tile's edges, the line height, and the gaps between logo, ticker and change
export const TILE_PADDING_X = 4;
export const TILE_PADDING_Y = 3;
export const LINE_HEIGHT = 1.2;
const LINE_GAP = 1;
const LOGO_GAP = 5;

// The largest content that fits entirely inside a box of this size, or null when only the color fits
export function fitTileContent(
    box: { width: number; height: number },
    ticker: string,
    value: string | undefined,
    measure: Measure,
    { logo }: { logo: boolean }
): TileContent | null {
    for (const tier of TILE_TIERS) {
        if (tier.logo && !logo) continue;
        const valueSize = value ? tier.valueSize : 0;
        const width = Math.max(measure(ticker, tier.tickerSize, 600), valueSize ? measure(value!, valueSize, 500) : 0, tier.logo) + 2 * TILE_PADDING_X;
        const height =
            2 * TILE_PADDING_Y +
            tier.tickerSize * LINE_HEIGHT +
            (valueSize ? LINE_GAP + valueSize * LINE_HEIGHT : 0) +
            (tier.logo ? tier.logo + LOGO_GAP : 0);
        if (width <= box.width && height <= box.height) return { ...tier, valueSize };
    }
    return null;
}

// Sector headings: the full name when it fits, else the short one, else none (the name is still
// in the heading's accessible label and tooltip)
export const HEADING_FONT_SIZE = 10;
export const HEADING_TRACKING = 0.08; // em
const HEADING_PADDING = 12;

export function fitHeading(width: number, names: { full: string; short: string }, measure: Measure) {
    const textWidth = (text: string) =>
        measure(text.toUpperCase(), HEADING_FONT_SIZE, 600) + text.length * HEADING_TRACKING * HEADING_FONT_SIZE + HEADING_PADDING;
    if (textWidth(names.full) <= width) return names.full;
    if (textWidth(names.short) <= width) return names.short;
    return null;
}

// A stand-in for text measurement where there's no canvas (tests and the server): Geist's average advance widths,
// rounded up so the estimate never comes out narrower than the real text
export const estimateTextWidth: Measure = (text, fontSize, weight) => {
    let units = 0;
    for (const char of text) {
        if (/[0-9]/.test(char)) units += 0.6;
        else if (/[MW]/.test(char)) units += 0.9;
        else if (/[A-Z]/.test(char)) units += 0.72;
        else if (/[.,:]/.test(char)) units += 0.3;
        else if (char === " ") units += 0.28;
        else if (char === "%") units += 0.85;
        else if (char === "+" || char === "-" || char === "−") units += 0.62;
        else units += 0.6;
    }
    return units * fontSize * (weight === 600 ? 1.04 : 1);
};

// ---------- Where the details card goes ----------

type Size = { width: number; height: number };
export type Position = { left: number; top: number };

// Space between the card and the cursor or tile, and the least space kept from the window's edges
const GAP = 14;
const MARGIN = 8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// Keeps the card inside the window, even when the window is smaller than the card
const clampToViewport = ({ left, top }: Position, card: Size, viewport: Size): Position => ({
    left: clamp(left, MARGIN, Math.max(MARGIN, viewport.width - card.width - MARGIN)),
    top: clamp(top, MARGIN, Math.max(MARGIN, viewport.height - card.height - MARGIN)),
});

// Below and to the right of the cursor, flipping to the other side near the window's right or bottom edge,
// so the card never covers the spot being pointed at
export const placeNearPoint = (point: { x: number; y: number }, card: Size, viewport: Size): Position => {
    const fitsRight = point.x + GAP + card.width <= viewport.width - MARGIN;
    const fitsBelow = point.y + GAP + card.height <= viewport.height - MARGIN;
    return clampToViewport(
        {
            left: fitsRight ? point.x + GAP : point.x - GAP - card.width,
            top: fitsBelow ? point.y + GAP : point.y - GAP - card.height,
        },
        card,
        viewport
    );
};

// Beside a tile without covering it: to its right, else its left, else below, else above.
// A tile too big to leave room around it gets the card inside its top left corner.
export const placeBesideRect = (rect: { left: number; top: number; right: number; bottom: number }, card: Size, viewport: Size): Position => {
    const fitsX = (left: number) => left >= MARGIN && left + card.width <= viewport.width - MARGIN;
    const fitsY = (top: number) => top >= MARGIN && top + card.height <= viewport.height - MARGIN;
    const options: Position[] = [
        { left: rect.right + GAP, top: rect.top },
        { left: rect.left - GAP - card.width, top: rect.top },
        { left: rect.left, top: rect.bottom + GAP },
        { left: rect.left, top: rect.top - GAP - card.height },
    ];
    const sideways = options.slice(0, 2).find((option) => fitsX(option.left));
    if (sideways) return clampToViewport(sideways, card, viewport);
    const vertical = options.slice(2).find((option) => fitsY(option.top));
    if (vertical) return clampToViewport(vertical, card, viewport);
    return clampToViewport({ left: rect.left + GAP, top: rect.top + GAP }, card, viewport);
};

// ---------- Arrow keys ----------

export type Direction = "left" | "right" | "up" | "down";

export const ARROW_DIRECTIONS: Record<string, Direction> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

// How far apart two spans are along one axis (0 when they overlap)
const spanGap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, bStart - aEnd, aStart - bEnd);

// The tile an arrow key moves to: the closest one on that side, preferring tiles in line with the current one
export const nearestInDirection = <T>(from: Placed<T>, tiles: readonly Placed<T>[], direction: Direction): Placed<T> | undefined => {
    const a: Rect = from.rect;
    const horizontal = direction === "left" || direction === "right";
    let best: Placed<T> | undefined;
    let bestScore = Infinity;

    for (const tile of tiles) {
        if (tile === from) continue;
        const b = tile.rect;
        // Distance in the arrow's direction; tiles behind or level with the current one don't count
        const ahead =
            direction === "right" ? b.x - (a.x + a.width) :
            direction === "left" ? a.x - (b.x + b.width) :
            direction === "down" ? b.y - (a.y + a.height) :
            a.y - (b.y + b.height);
        if (ahead < -1) continue;

        const offAxis = horizontal ? spanGap(a.y, a.y + a.height, b.y, b.y + b.height) : spanGap(a.x, a.x + a.width, b.x, b.x + b.width);
        const centerOffset = horizontal
            ? Math.abs(b.y + b.height / 2 - (a.y + a.height / 2))
            : Math.abs(b.x + b.width / 2 - (a.x + a.width / 2));
        const score = Math.max(ahead, 0) + offAxis * 3 + centerOffset * 0.1;
        if (score < bestScore) {
            bestScore = score;
            best = tile;
        }
    }
    return best;
};
