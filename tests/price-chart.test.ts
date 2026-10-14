import { describe, expect, it } from 'vitest';
import { bollingerBands, DEFAULT_CHART_SETTINGS, dayChangePercent, relativeStrengthIndex, isChartRange, monthsBefore, parseChartSettings, rangeStartIndex, simpleMovingAverage } from '@/lib/price-chart';

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
    expect(parseChartSettings({ source: 'daily', range: '5y', style: 'line', averages: [200, 13] })).toEqual({ source: 'daily', range: '5y', style: 'line', averages: [200], indicators: [] });
    expect(parseChartSettings({ averages: [] }).averages).toEqual([]);
    expect(parseChartSettings({ indicators: ['rsi', 'macd', 'bollinger'] }).indicators).toEqual(['bollinger', 'rsi']);
    expect(parseChartSettings({ indicators: 'rsi' }).indicators).toEqual([]);
  });
});

// StockCharts' worked RSI example (ChartSchool, "Relative Strength Index"): 14-session Wilder RSI on these closes
const RSI_CLOSES = [44.3389, 44.0902, 44.1497, 43.6124, 44.2779, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439];
const RSI_EXPECTED = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97];

describe('relative strength index', () => {
  it("matches StockCharts' published 14-session values", () => {
    const rsi = relativeStrengthIndex(RSI_CLOSES, 14);
    expect(rsi.slice(0, 14).every((v) => v === undefined)).toBe(true);
    rsi.slice(14).forEach((value, i) => expect(value).toBeCloseTo(RSI_EXPECTED[i], 2));
  });

  it('is 100 with only gains, 0 with only losses, and empty without enough sessions', () => {
    expect(relativeStrengthIndex([1, 2, 3, 4], 3)).toEqual([undefined, undefined, undefined, 100]);
    expect(relativeStrengthIndex([4, 3, 2, 1], 3)).toEqual([undefined, undefined, undefined, 0]);
    expect(relativeStrengthIndex([1, 2, 3], 3)).toEqual([undefined, undefined, undefined]);
    expect(relativeStrengthIndex([], 14)).toEqual([]);
  });

  it('smooths with Wilder\'s method after the first average', () => {
    // Changes +2, −1, then +3: first averages 1 and 0.5, then gain (1·1 + 3)/2 = 2, loss (0.5·1 + 0)/2 = 0.25
    const rsi = relativeStrengthIndex([10, 12, 11, 14], 2);
    expect(rsi[2]).toBeCloseTo(100 - 100 / (1 + 1 / 0.5), 10);
    expect(rsi[3]).toBeCloseTo(100 - 100 / (1 + 2 / 0.25), 10);
  });
});

describe('Bollinger Bands', () => {
  it('are the average plus and minus two population standard deviations', () => {
    // Closes 2, 4, 4, 4, 5, 5, 7, 9: mean 5, population standard deviation 2
    const bands = bollingerBands([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(bands.slice(0, 7).every((b) => b === undefined)).toBe(true);
    expect(bands[7]).toEqual({ upper: 9, middle: 5, lower: 1 });
  });

  it('roll with the window and collapse on flat closes', () => {
    const bands = bollingerBands([1, 2, 3, 4], 3, 2);
    const sd = Math.sqrt(2 / 3);
    expect(bands[2]!.middle).toBeCloseTo(2, 10);
    expect(bands[3]!.upper).toBeCloseTo(3 + 2 * sd, 10);
    expect(bands[3]!.lower).toBeCloseTo(3 - 2 * sd, 10);
    expect(bollingerBands([5, 5, 5], 3, 2)[2]).toEqual({ upper: 5, middle: 5, lower: 5 });
  });
});
