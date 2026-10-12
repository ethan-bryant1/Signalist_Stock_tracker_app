import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FULL_COLOR_AT, LEGEND_TICKS, NEUTRAL_BAND, heatStrength, legendGradient, tileBackground } from '@/lib/heatmap';
import { MISSING_STRIPE_ALPHA, STALE_STRIPE_ALPHA } from '@/components/StockHeatmap';

describe('heatStrength', () => {
  it('has no strength without a figure', () => {
    expect(heatStrength(undefined)).toBeUndefined();
    expect(heatStrength(Number.NaN)).toBeUndefined();
    expect(heatStrength(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('is flat inside the neutral band, on both sides', () => {
    expect(heatStrength(0)).toBe(0);
    expect(heatStrength(0.049)).toBe(0);
    expect(heatStrength(-0.049)).toBe(0);
  });

  it('starts coloring at the edge of the band', () => {
    expect(heatStrength(NEUTRAL_BAND)).toBeCloseTo(NEUTRAL_BAND / FULL_COLOR_AT);
    expect(heatStrength(-NEUTRAL_BAND)).toBeCloseTo(-NEUTRAL_BAND / FULL_COLOR_AT);
  });

  it('grows in proportion to the move and reaches full color at ±3%', () => {
    expect(heatStrength(1.5)).toBeCloseTo(0.5);
    expect(heatStrength(-1.5)).toBeCloseTo(-0.5);
    expect(heatStrength(FULL_COLOR_AT)).toBe(1);
    expect(heatStrength(-FULL_COLOR_AT)).toBe(-1);
  });

  it('caps outliers so they cannot wash out the rest of the map', () => {
    expect(heatStrength(14.7)).toBe(1);
    expect(heatStrength(-40)).toBe(-1);
  });

  it('never decreases as the move grows', () => {
    let previous = -Infinity;
    for (let change = -6; change <= 6; change += 0.01) {
      const strength = heatStrength(change)!;
      expect(strength).toBeGreaterThanOrEqual(previous);
      previous = strength;
    }
  });
});

describe('tileBackground', () => {
  it('is the flat color with no figure or a flat move', () => {
    expect(tileBackground(undefined)).toBe('var(--heat-flat)');
    expect(tileBackground(0.01)).toBe('var(--heat-flat)');
  });

  it('mixes toward green for gains and red for losses', () => {
    expect(tileBackground(1.5)).toBe('color-mix(in oklab, var(--heat-up) 50%, var(--heat-flat))');
    expect(tileBackground(-3)).toBe('color-mix(in oklab, var(--heat-down) 100%, var(--heat-flat))');
    expect(tileBackground(-9)).toBe(tileBackground(-3));
  });
});

describe('legend', () => {
  it('labels whole percents from -3 to +3', () => {
    expect(LEGEND_TICKS).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('draws the same mix as the tiles from full red to full green', () => {
    const gradient = legendGradient();
    expect(gradient.startsWith(`linear-gradient(to right, ${tileBackground(-3)} 0.0%`)).toBe(true);
    expect(gradient.endsWith(`${tileBackground(3)} 100.0%)`)).toBe(true);
    expect(gradient).toContain(`${tileBackground(0)} 50.0%`);
  });
});

// ---------- White labels stay readable on every shade ----------
// Reads the palette from app/globals.css and mixes it the way the browser's color-mix(in oklab) does,
// then checks white text against every shade at 1% steps (WCAG 2 contrast, at least 4.5:1).

type RGB = [number, number, number];

const hex = (value: string): RGB => {
  const h = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
};
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const toOklab = (rgb: RGB): RGB => {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const fromOklab = ([L, a, b]: RGB): RGB => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => Math.min(1, Math.max(0, fromLinear(c)))) as RGB;
};

const mix = (a: RGB, b: RGB, amountOfA: number): RGB => {
  const x = toOklab(a);
  const y = toOklab(b);
  return fromOklab([0, 1, 2].map((i) => x[i] * amountOfA + y[i] * (1 - amountOfA)) as RGB);
};

const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWithWhite = (rgb: RGB) => 1.05 / (luminance(rgb) + 0.05);

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
// The block for a selector that sets the heat colors (globals.css has other blocks with the same selectors)
const block = (selector: string) => {
  for (let start = css.indexOf(`${selector} {`); start >= 0; start = css.indexOf(`${selector} {`, start + 1)) {
    // Skip a match that is only the end of a longer selector, like ".dark" inside ".dark [data-heat-palette]"
    const before = css[start - 1];
    if (before && !/\s|}/.test(before)) continue;
    const body = css.slice(start, css.indexOf('}', start));
    if (!body.includes('--heat-')) continue;
    const read = (name: string) => body.match(new RegExp(`--heat-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
    return { flat: read('flat'), up: read('up'), down: read('down') };
  }
  throw new Error(`No heat colors for ${selector} in globals.css`);
};

const palettes = (() => {
  const root = block(':root');
  const dark = block('.dark');
  const cvd = block('[data-heat-palette="cvd"]');
  const darkCvd = block('.dark [data-heat-palette="cvd"]');
  return {
    'light, green/red': root,
    'dark, green/red': dark,
    'light, blue/orange': { ...root, up: cvd.up, down: cvd.down },
    'dark, blue/orange': { ...dark, up: darkCvd.up, down: darkCvd.down },
  } as Record<string, { flat?: string; up?: string; down?: string }>;
})();

describe('heat palette contrast', () => {
  it('finds every color in globals.css', () => {
    for (const palette of Object.values(palettes)) {
      expect(palette.flat).toMatch(/^#/);
      expect(palette.up).toMatch(/^#/);
      expect(palette.down).toMatch(/^#/);
    }
  });

  for (const [name, palette] of Object.entries(palettes)) {
    it(`keeps white text at 4.5:1 or better on every shade (${name})`, () => {
      const flat = hex(palette.flat!);
      let worst = Infinity;
      for (const end of [hex(palette.up!), hex(palette.down!)]) {
        for (let step = 0; step <= 100; step++) worst = Math.min(worst, contrastWithWhite(mix(end, flat, step / 100)));
      }
      expect(worst).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Stale and missing tiles get black stripes laid over their color (the browser blends them in sRGB). Darkening
  // can only help white text, and the stripes still have to stand out from the tile under them.
  for (const [label, alpha] of [['stale', STALE_STRIPE_ALPHA], ['missing', MISSING_STRIPE_ALPHA]] as const) {
    it(`keeps white text readable on ${label} stripes and the stripes visible, in every palette`, () => {
      const overBlack = (rgb: RGB) => rgb.map((c) => c * (1 - alpha)) as RGB;
      const contrast = (a: RGB, b: RGB) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      for (const palette of Object.values(palettes)) {
        const flat = hex(palette.flat!);
        for (const end of [hex(palette.up!), hex(palette.down!)]) {
          for (let step = 0; step <= 100; step += 5) {
            const shade = mix(end, flat, step / 100);
            expect(contrastWithWhite(overBlack(shade))).toBeGreaterThanOrEqual(4.5);
            expect(contrast(shade, overBlack(shade))).toBeGreaterThanOrEqual(1.15);
          }
        }
      }
    });
  }

  it('keeps a full gain and a full loss far apart in every palette', () => {
    for (const palette of Object.values(palettes)) {
      const up = toOklab(hex(palette.up!));
      const down = toOklab(hex(palette.down!));
      expect(Math.hypot(up[1] - down[1], up[2] - down[2])).toBeGreaterThan(0.15);
    }
  });
});
