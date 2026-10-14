import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_SETTINGS, dayChangePercent, isChartRange, monthsBefore, parseChartSettings, rangeStartIndex, simpleMovingAverage } from '@/lib/price-chart';

describe('chart ranges', () => {
  it('steps back whole calendar months, clamping to the shorter month', () => {
    expect(monthsBefore('2026-10-13', 3)).toBe('2026-07-13');
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsBefore('2024-03-30', 1)).toBe('2024-02-29');
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15');
    expect(monthsBefore('2026-10-13', 60)).toBe('2021-10-13');
  });

  const days = ['2025-10-10', '2025-10-13', '2025-10-14', '2025-12-31', '2026-01-02', '2026-07-13', '2026-07-14', '2026-10-13'];

  it('starts each range after the same day that many months before the newest bar', () => {
    expect(rangeStartIndex(days, '1y')).toBe(2);
    expect(rangeStartIndex(days, '3m')).toBe(6);
    expect(rangeStartIndex(days, 'ytd')).toBe(4);
    expect(rangeStartIndex(days, 'max')).toBe(0);
  });

  it('shows everything when the history is shorter than the range', () => {
    expect(rangeStartIndex(days, '5y')).toBe(0);
    expect(rangeStartIndex([], '1y')).toBe(0);
  });

  it('accepts only known ranges', () => {
    expect(isChartRange('6m')).toBe(true);
    expect(isChartRange('2y')).toBe(false);
    expect(isChartRange(undefined)).toBe(false);
  });
});

describe('moving averages', () => {
  it('averages the last N closes and leaves the first N−1 sessions empty', () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
    expect(simpleMovingAverage([10, 20], 3)).toEqual([undefined, undefined]);
    expect(simpleMovingAverage([], 50)).toEqual([]);
  });

  it('matches a direct average over a long series', () => {
    const values = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.1);
    const sma = simpleMovingAverage(values, 200);
    const direct = values.slice(100, 300).reduce((a, b) => a + b, 0) / 200;
    expect(sma[299]).toBeCloseTo(direct, 9);
    expect(sma[198]).toBeUndefined();
  });
});

describe("a session's change", () => {
  it('is the simple return from the previous close', () => {
    expect(dayChangePercent([100, 105, 99.75], 1)).toBeCloseTo(5, 10);
    expect(dayChangePercent([100, 105, 99.75], 2)).toBeCloseTo(-5, 10);
  });

  it('is unknown for the first bar or an index outside the series', () => {
    expect(dayChangePercent([100, 105], 0)).toBeUndefined();
    expect(dayChangePercent([100, 105], 2)).toBeUndefined();
  });
});

describe('saved chart settings', () => {
  it('keeps TradingView as the default and drops anything unknown', () => {
    expect(parseChartSettings(null)).toEqual(DEFAULT_CHART_SETTINGS);
    expect(parseChartSettings({ source: 'other', range: '2y', style: 'bars', averages: 'x' })).toEqual(DEFAULT_CHART_SETTINGS);
  });

  it('reads saved choices', () => {
    expect(parseChartSettings({ source: 'daily', range: '5y', style: 'line', averages: [200, 13] })).toEqual({ source: 'daily', range: '5y', style: 'line', averages: [200] });
    expect(parseChartSettings({ averages: [] }).averages).toEqual([]);
  });
});
