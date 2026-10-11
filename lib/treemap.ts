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

// Lays out groups (like market sectors) first, then each group's items inside its box.
// Groups are split by `gap` pixels; a group gets a `labelHeight` strip for its name when there's room.
export const layoutGroups = <T>(
    groups: readonly { key: string; label: string; items: readonly T[] }[],
    valueOf: (item: T) => number,
    rect: Rect,
    { gap = 0, labelHeight = 0 }: { gap?: number; labelHeight?: number } = {}
): TreemapGroup<T>[] =>
    squarify(groups, (group) => group.items.reduce((sum, item) => sum + Math.max(valueOf(item), 0), 0), rect).map(({ item: group, rect: box }) => {
        const inner = {
            x: box.x + gap / 2,
            y: box.y + gap / 2,
            width: Math.max(box.width - gap, 0),
            height: Math.max(box.height - gap, 0),
        };
        const showLabel = labelHeight > 0 && inner.height >= labelHeight * 3 && inner.width >= 72;
        const body = showLabel
            ? { x: inner.x, y: inner.y + labelHeight, width: inner.width, height: inner.height - labelHeight }
            : inner;

        return { key: group.key, label: group.label, rect: inner, showLabel, tiles: squarify(group.items, valueOf, body) };
    });
