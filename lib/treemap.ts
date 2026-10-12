// Layout math for the stock heatmap: splits a rectangle into boxes sized by value

export type Rect = { x: number; y: number; width: number; height: number };

export type Placed<T> = { item: T; rect: Rect };

// Squarified treemap (Bruls, Huizing and van Wijk): one box per item, its area proportional to the item's value,
// with boxes kept as close to square as possible so labels fit. Biggest items land top left.
export const squarify = <T>(items: readonly T[], valueOf: (item: T) => number, rect: Rect): Placed<T>[] => {
    const sorted = items.filter((item) => valueOf(item) > 0).sort((a, b) => valueOf(b) - valueOf(a));
    const total = sorted.reduce((sum, item) => sum + valueOf(item), 0);
    if (!total || rect.width <= 0 || rect.height <= 0) return [];

    const scale = (rect.width * rect.height) / total;
    const placed: Placed<T>[] = [];
    let free = { ...rect };
    let row: { item: T; area: number }[] = [];
    let rowArea = 0;

    // How far from square the row's least square box is, if the row runs along a side of this length
    const worstRatio = (area: number, largest: number, smallest: number, side: number) =>
        Math.max((side * side * largest) / (area * area), (area * area) / (side * side * smallest));

    // Lays the row along the free space's shorter side, then shrinks the free space
    const placeRow = () => {
        if (free.width >= free.height) {
            const width = rowArea / free.height;
            let y = free.y;
            for (const { item, area } of row) {
                const height = area / width;
                placed.push({ item, rect: { x: free.x, y, width, height } });
                y += height;
            }
            free = { x: free.x + width, y: free.y, width: free.width - width, height: free.height };
        } else {
            const height = rowArea / free.width;
            let x = free.x;
            for (const { item, area } of row) {
                const width = area / height;
                placed.push({ item, rect: { x, y: free.y, width, height } });
                x += width;
            }
            free = { x: free.x, y: free.y + height, width: free.width, height: free.height - height };
        }
    };

    for (const item of sorted) {
        const area = valueOf(item) * scale;
        if (row.length === 0) {
            row = [{ item, area }];
            rowArea = area;
            continue;
        }

        // Items arrive biggest first, so the row's first box is its largest and the new one its smallest
        const side = Math.min(free.width, free.height);
        const largest = row[0].area;
        if (worstRatio(rowArea + area, largest, area, side) <= worstRatio(rowArea, largest, row[row.length - 1].area, side)) {
            row.push({ item, area });
            rowArea += area;
        } else {
            placeRow();
            row = [{ item, area }];
            rowArea = area;
        }
    }
    if (row.length) placeRow();

    return placed;
};

export type TreemapGroup<T> = {
    key: string;
    label: string;
    // The group's whole box, with room for its label at the top when it's big enough
    rect: Rect;
    showLabel: boolean;
    tiles: Placed<T>[];
};

type GroupInput<T> = { key: string; label: string; items: readonly T[] };

// One group's box split into its label strip and the part its items fill
const splitGroupBox = (box: Rect, gap: number, labelHeight: number, minLabelWidth: number) => {
    const inner = {
        x: box.x + gap / 2,
        y: box.y + gap / 2,
        width: Math.max(box.width - gap, 0),
        height: Math.max(box.height - gap, 0),
    };
    const showLabel = labelHeight > 0 && inner.height >= labelHeight * 2.5 && inner.width >= minLabelWidth;
    const body = showLabel ? { x: inner.x, y: inner.y + labelHeight, width: inner.width, height: inner.height - labelHeight } : inner;
    return { inner, body, showLabel };
};

// Lays out groups (like market sectors) first, then each group's items inside its box.
// Groups are split by `gap` pixels, and a group gets a `labelHeight` strip for its name when there's room.
// The gaps and labels take space, which would leave small groups with less area per unit of value than big ones,
// so the group boxes are re-weighted a few times until every group's items get the same area per unit
// (within half a percent where the space allows it).
export const layoutGroups = <T>(
    groups: readonly GroupInput<T>[],
    valueOf: (item: T) => number,
    rect: Rect,
    { gap = 0, labelHeight = 0, minLabelWidth = 72 }: { gap?: number; labelHeight?: number; minLabelWidth?: number } = {}
): TreemapGroup<T>[] => {
    const totals = groups.map((group) => group.items.reduce((sum, item) => sum + Math.max(valueOf(item), 0), 0));
    const indexes = groups.map((_, index) => index).filter((index) => totals[index] > 0);
    const weights = [...totals];

    let boxes: Placed<number>[] = [];
    for (let pass = 0; pass < 8; pass++) {
        boxes = squarify(indexes, (index) => weights[index], rect);
        if (gap === 0 && labelHeight === 0) break;

        const bodyAreas = new Map(boxes.map(({ item, rect: box }) => {
            const { body } = splitGroupBox(box, gap, labelHeight, minLabelWidth);
            return [item, body.width * body.height];
        }));
        const totalArea = [...bodyAreas.values()].reduce((sum, area) => sum + area, 0);
        const totalValue = indexes.reduce((sum, index) => sum + totals[index], 0);
        if (!totalArea || !totalValue) break;
        const areaPerValue = totalArea / totalValue;

        let worst = 0;
        for (const index of indexes) {
            const wanted = totals[index] * areaPerValue;
            const got = bodyAreas.get(index) ?? 0;
            worst = Math.max(worst, Math.abs(got / wanted - 1));
            weights[index] *= got > 0 ? wanted / got : 2;
        }
        if (worst < 0.005) break;
    }

    return boxes.map(({ item: index, rect: box }) => {
        const group = groups[index];
        const { inner, body, showLabel } = splitGroupBox(box, gap, labelHeight, minLabelWidth);
        return { key: group.key, label: group.label, rect: inner, showLabel, tiles: squarify(group.items, valueOf, body) };
    });
};
