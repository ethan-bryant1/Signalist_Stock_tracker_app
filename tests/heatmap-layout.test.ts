import { describe, expect, it } from 'vitest';
import {
  LINE_HEIGHT,
  TILE_PADDING_X,
  TILE_PADDING_Y,
  estimateTextWidth,
  fitHeading,
  fitTileContent,
  nearestInDirection,
  placeBesideRect,
  placeNearPoint,
  type Measure,
} from '@/lib/heatmap';
import { layoutGroups, squarify, type Placed, type Rect } from '@/lib/treemap';

const area = (r: Rect) => r.width * r.height;
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 && inner.x + inner.width <= outer.x + outer.width + 1e-6 && inner.y + inner.height <= outer.y + outer.height + 1e-6;

// A deterministic spread of values like market caps (a few giants, a long tail)
const caps = Array.from({ length: 60 }, (_, i) => ({ id: `S${i}`, value: Math.round(4_000_000 / (i + 1) ** 1.3) }));

describe('squarify', () => {
  const rect = { x: 0, y: 0, width: 900, height: 600 };
  const tiles = squarify(caps, (c) => c.value, rect);

  it('gives every item an area in proportion to its value', () => {
    const total = caps.reduce((sum, c) => sum + c.value, 0);
    for (const { item, rect: r } of tiles) expect(area(r) / area(rect)).toBeCloseTo(item.value / total, 9);
  });

  it('fills the box exactly, without overlaps or spills', () => {
    expect(tiles.reduce((sum, t) => sum + area(t.rect), 0)).toBeCloseTo(area(rect), 6);
    for (const t of tiles) expect(inside(t.rect, rect)).toBe(true);
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) expect(overlaps(tiles[i].rect, tiles[j].rect)).toBe(false);
  });

  it('leaves out items with no size instead of inventing one', () => {
    const placed = squarify([{ id: 'a', value: 5 }, { id: 'b', value: 0 }, { id: 'c', value: -2 }, { id: 'd', value: 5 }], (c) => c.value, rect);
    expect(placed.map((t) => t.item.id).sort()).toEqual(['a', 'd']);
  });

  it('places nothing in an empty box or for an empty list', () => {
    expect(squarify(caps, (c) => c.value, { x: 0, y: 0, width: 0, height: 100 })).toEqual([]);
    expect(squarify([], () => 1, rect)).toEqual([]);
  });

  it('makes equal values equal areas (the "Equal" size option)', () => {
    const equal = squarify(caps, () => 1, rect);
    for (const t of equal) expect(area(t.rect)).toBeCloseTo(area(rect) / caps.length, 6);
  });
});

describe('layoutGroups', () => {
  // Sector-like groups of very different sizes
  const groups = [
    { key: 'big', label: 'Big', items: caps.slice(0, 12) },
    { key: 'mid', label: 'Mid', items: caps.slice(12, 30) },
    { key: 'small', label: 'Small', items: caps.slice(30, 33) },
    { key: 'tiny', label: 'Tiny', items: caps.slice(50, 53) },
    { key: 'empty', label: 'Empty', items: [] },
  ];
  const rect = { x: 0, y: 0, width: 1000, height: 700 };
  const laid = layoutGroups(groups, (c) => c.value, rect, { gap: 3, labelHeight: 18 });

  it('skips groups with nothing to draw', () => {
    expect(laid.map((g) => g.key).sort()).toEqual(['big', 'mid', 'small', 'tiny']);
  });

  it('gives a dollar the same area in every group, despite gaps and headings', () => {
    const perValue = laid.map((g) => g.tiles.reduce((sum, t) => sum + area(t.rect), 0) / g.tiles.reduce((sum, t) => sum + t.item.value, 0));
    const mean = perValue.reduce((a, b) => a + b, 0) / perValue.length;
    for (const v of perValue) expect(Math.abs(v / mean - 1)).toBeLessThan(0.01);
  });

  it('keeps each group inside its box and groups apart from each other', () => {
    for (const g of laid) {
      expect(inside(g.rect, rect)).toBe(true);
      for (const t of g.tiles) expect(inside(t.rect, g.rect)).toBe(true);
    }
    for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) expect(overlaps(laid[i].rect, laid[j].rect)).toBe(false);
  });

  it('keeps every stock in its own group when the layout changes', () => {
    const equal = layoutGroups(groups, () => 1, rect, { gap: 3, labelHeight: 18 });
    for (const g of equal) {
      const source = groups.find((s) => s.key === g.key)!;
      expect(g.tiles.map((t) => t.item.id).sort()).toEqual(source.items.map((i) => i.id).sort());
    }
  });

  it('only shows a heading where there is room for it', () => {
    const cramped = layoutGroups(groups, (c) => c.value, { x: 0, y: 0, width: 300, height: 120 }, { gap: 3, labelHeight: 18 });
    for (const g of cramped) {
      if (g.showLabel) {
        expect(g.rect.height).toBeGreaterThanOrEqual(18 * 2.5);
        expect(g.rect.width).toBeGreaterThanOrEqual(72);
      }
    }
  });
});

describe('fitTileContent', () => {
  // A stand-in measure: 0.62em per character, so results are easy to reason about
  const measure: Measure = (text, size) => text.length * size * 0.62;
  const fits = (box: { width: number; height: number }, ticker: string, value: string, logo: boolean) => {
    const c = fitTileContent(box, ticker, value, measure, { logo });
    if (!c) return true;
    const width = Math.max(measure(ticker, c.tickerSize, 600), c.valueSize ? measure(value, c.valueSize, 500) : 0, c.logo) + 2 * TILE_PADDING_X;
    const height = 2 * TILE_PADDING_Y + c.tickerSize * LINE_HEIGHT + (c.valueSize ? 1 + c.valueSize * LINE_HEIGHT : 0) + (c.logo ? c.logo + 5 : 0);
    return width <= box.width && height <= box.height;
  };

  it('shows logo, ticker and change on a large tile', () => {
    expect(fitTileContent({ width: 200, height: 140 }, 'AAPL', '+1.23%', measure, { logo: true })).toEqual({ logo: 28, tickerSize: 20, valueSize: 14 });
  });

  it('drops the logo when logos are off or missing', () => {
    expect(fitTileContent({ width: 200, height: 140 }, 'AAPL', '+1.23%', measure, { logo: false })?.logo).toBe(0);
  });

  it('shows the ticker alone when the change does not fit', () => {
    const c = fitTileContent({ width: 36, height: 20 }, 'KO', '+0.12%', measure, { logo: false });
    expect(c?.valueSize).toBe(0);
    expect(c?.tickerSize).toBeGreaterThan(0);
  });

  it('shows only the color on a sliver', () => {
    expect(fitTileContent({ width: 14, height: 40 }, 'GOOGL', '+1.00%', measure, { logo: true })).toBeNull();
    expect(fitTileContent({ width: 120, height: 8 }, 'GOOGL', '+1.00%', measure, { logo: true })).toBeNull();
  });

  it('never returns content bigger than its tile, at any size', () => {
    for (let w = 4; w <= 260; w += 7) {
      for (let h = 4; h <= 180; h += 5) {
        for (const [ticker, value] of [['BRK.B', '-12.34%'], ['V', '+0.00%'], ['GOOGL', '—']]) {
          expect(fits({ width: w, height: h }, ticker, value, true)).toBe(true);
        }
      }
    }
  });

  it('measures a wide ticker as wider, so it gets a smaller tier', () => {
    const narrow = fitTileContent({ width: 60, height: 40 }, 'V', '+1.00%', measure, { logo: false })!;
    const wide = fitTileContent({ width: 60, height: 40 }, 'BRK.B', '+1.00%', measure, { logo: false })!;
    expect(wide.tickerSize).toBeLessThanOrEqual(narrow.tickerSize);
  });
});

describe('fitHeading', () => {
  const names = { full: 'Consumer Discretionary', short: 'Cons. Discretionary' };
  it('uses the full name, then the short one, then none', () => {
    expect(fitHeading(400, names, estimateTextWidth)).toBe(names.full);
    const shortOnly = [...Array(400).keys()].find((w) => fitHeading(w, names, estimateTextWidth) === names.short);
    expect(shortOnly).toBeDefined();
    expect(fitHeading(30, names, estimateTextWidth)).toBeNull();
  });
});

describe('estimateTextWidth', () => {
  it('grows with text length and font size, and bold is wider', () => {
    expect(estimateTextWidth('AAPL', 12, 500)).toBeLessThan(estimateTextWidth('GOOGL', 12, 500));
    expect(estimateTextWidth('AAPL', 12, 500)).toBeLessThan(estimateTextWidth('AAPL', 16, 500));
    expect(estimateTextWidth('AAPL', 12, 500)).toBeLessThan(estimateTextWidth('AAPL', 12, 600));
  });
});

describe('hover card placement', () => {
  const viewport = { width: 1200, height: 800 };
  const card = { width: 256, height: 180 };
  const covers = (p: { left: number; top: number }, x: number, y: number) => x >= p.left && x <= p.left + card.width && y >= p.top && y <= p.top + card.height;
  const within = (p: { left: number; top: number }) => p.left >= 8 && p.top >= 8 && p.left + card.width <= viewport.width - 8 && p.top + card.height <= viewport.height - 8;

  it('sits below and right of the cursor, never under it', () => {
    const p = placeNearPoint({ x: 300, y: 200 }, card, viewport);
    expect(p.left).toBeGreaterThan(300);
    expect(p.top).toBeGreaterThan(200);
    expect(covers(p, 300, 200)).toBe(false);
  });

  it('flips at the right and bottom edges and stays on screen', () => {
    for (const point of [{ x: 1190, y: 790 }, { x: 1100, y: 100 }, { x: 50, y: 760 }, { x: 600, y: 400 }, { x: 2, y: 2 }]) {
      const p = placeNearPoint(point, card, viewport);
      expect(within(p)).toBe(true);
      expect(covers(p, point.x, point.y)).toBe(false);
    }
  });

  it('stays on screen even when the window is smaller than the card', () => {
    const p = placeNearPoint({ x: 100, y: 100 }, card, { width: 200, height: 150 });
    expect(p.left).toBe(8);
    expect(p.top).toBe(8);
  });

  it('goes beside a focused tile without covering it', () => {
    const tile = { left: 100, top: 100, right: 200, bottom: 160 };
    expect(placeBesideRect(tile, card, viewport)).toEqual({ left: 214, top: 100 });
    const atRight = { left: 1000, top: 100, right: 1150, bottom: 160 };
    expect(placeBesideRect(atRight, card, viewport)).toEqual({ left: 1000 - 14 - card.width, top: 100 });
  });

  it('goes below a tile that spans the width, and inside one that fills the screen', () => {
    expect(placeBesideRect({ left: 10, top: 100, right: 1190, bottom: 300 }, card, viewport)).toEqual({ left: 10, top: 314 });
    const huge = placeBesideRect({ left: 0, top: 0, right: 1200, bottom: 800 }, card, viewport);
    expect(within(huge)).toBe(true);
  });
});

describe('arrow keys', () => {
  // A 3×3 grid of 100px tiles
  const tiles: Placed<string>[] = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) tiles.push({ item: `${row}${col}`, rect: { x: col * 100, y: row * 100, width: 100, height: 100 } });
  const at = (id: string) => tiles.find((t) => t.item === id)!;

  it('moves to the neighbor in each direction', () => {
    expect(nearestInDirection(at('11'), tiles, 'left')?.item).toBe('10');
    expect(nearestInDirection(at('11'), tiles, 'right')?.item).toBe('12');
    expect(nearestInDirection(at('11'), tiles, 'up')?.item).toBe('01');
    expect(nearestInDirection(at('11'), tiles, 'down')?.item).toBe('21');
  });

  it('stays put at the edge', () => {
    expect(nearestInDirection(at('00'), tiles, 'left')).toBeUndefined();
    expect(nearestInDirection(at('22'), tiles, 'down')).toBeUndefined();
  });

  it('prefers the tile in line over one that only touches at a corner', () => {
    const uneven: Placed<string>[] = [
      { item: 'from', rect: { x: 0, y: 0, width: 100, height: 50 } },
      { item: 'inline', rect: { x: 100, y: 0, width: 100, height: 50 } },
      { item: 'diagonal', rect: { x: 100, y: 50, width: 100, height: 50 } },
    ];
    expect(nearestInDirection(uneven[0], uneven, 'right')?.item).toBe('inline');
  });
});
