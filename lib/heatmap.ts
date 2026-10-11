// Pure helpers for the stock heatmap (components/StockHeatmap.tsx): tile colors, where the details card goes,
// and which tile the arrow keys move to

import type { Placed, Rect } from "@/lib/treemap";

// Moves this big or bigger get the full green or red
export const FULL_COLOR_AT = 3;

// A tile's background: flat gray for no change, mixed toward green or red as the move grows (colors in globals.css)
export const tileBackground = (changePercent?: number) => {
    if (changePercent === undefined || changePercent === 0) return "var(--heat-flat)";
    const strength = Math.round(Math.min(Math.abs(changePercent) / FULL_COLOR_AT, 1) * 100);
    return `color-mix(in oklab, ${changePercent > 0 ? "var(--heat-up)" : "var(--heat-down)"} ${strength}%, var(--heat-flat))`;
};

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
