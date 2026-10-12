import { describe, expect, it } from 'vitest';
import { applyLiveTrades } from '@/lib/live-trades';
import type { HeatmapStock, Quote } from '@/lib/market-data';
import { parseFinnhubStats, periodStarts, statsAnchor, volumeSize, withPeriodChange } from '@/lib/period-change';

// Tue 2026-10-13 2:00 PM and Mon 2026-10-12 4:00 PM New York (EDT, UTC−4)
const TUESDAY_2PM = Date.UTC(2026, 9, 13, 18);
const MONDAY_CLOSE = Date.UTC(2026, 9, 12, 20);

const stock = (quote?: Quote, extra: Partial<HeatmapStock> = {}): HeatmapStock => ({ symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', industry: '', quote, ...extra });

describe('parseFinnhubStats', () => {
  it('reads the period returns and the 10-day average volume (millions of shares)', () => {
    const stats = parseFinnhubStats({
      metric: {
        '5DayPriceReturnDaily': 2.5,
        monthToDatePriceReturnDaily: -1,
        '13WeekPriceReturnDaily': 10,
        '26WeekPriceReturnDaily': 20,
        yearToDatePriceReturnDaily: 25,
        '52WeekPriceReturnDaily': 40,
        '10DayAverageTradingVolume': 52.5,
      },
    });
    expect(stats.returns).toEqual({ '1w': 2.5, mtd: -1, '3m': 10, '6m': 20, ytd: 25, '1y': 40 });
    expect(stats.averageVolume).toBe(52_500_000);
  });

  it('leaves out missing, non-numeric and impossible figures rather than guessing', () => {
    const stats = parseFinnhubStats({ metric: { '5DayPriceReturnDaily': null, '13WeekPriceReturnDaily': '10', '52WeekPriceReturnDaily': -100, '10DayAverageTradingVolume': 0 } });
    expect(stats).toEqual({ returns: {}, averageVolume: undefined });
    expect(parseFinnhubStats(undefined)).toEqual({ returns: {}, averageVolume: undefined });
  });
});

describe('statsAnchor', () => {
  it("is the previous close once today's price is in, and the last price before that", () => {
    expect(statsAnchor({ price: 110, previousClose: 100, time: TUESDAY_2PM - 60_000 }, TUESDAY_2PM)).toBe(100);
    expect(statsAnchor({ price: 100, previousClose: 95, time: MONDAY_CLOSE }, TUESDAY_2PM)).toBe(100);
    expect(statsAnchor(undefined, TUESDAY_2PM)).toBeUndefined();
  });
});

describe('periodStarts and withPeriodChange', () => {
  it('works out where each period started, so the live price gives the change', () => {
    const starts = periodStarts({ returns: { '1w': 25, ytd: -20 } }, 100)!;
    expect(starts['1w']).toBeCloseTo(80);
    expect(starts.ytd).toBeCloseTo(125);

    const shown = withPeriodChange(stock({ price: 120, previousClose: 100, change: 20, changePercent: 20, time: TUESDAY_2PM }, { periodStart: starts }), '1w');
    expect(shown.quote!.change).toBeCloseTo(40);
    expect(shown.quote!.changePercent).toBeCloseTo(50);
    expect(shown.quote!.price).toBe(120);
  });

  it('shows no change, never the 1-day one, when the period has no starting price', () => {
    const shown = withPeriodChange(stock({ price: 120, previousClose: 100, change: 20, changePercent: 20 }), '3m');
    expect(shown.quote!.changePercent).toBeUndefined();
    expect(shown.quote!.change).toBeUndefined();
  });

  it('moves with live trades and gives back the same object for an unchanged stock', () => {
    const original = stock({ price: 100, previousClose: 100, change: 0, changePercent: 0, time: TUESDAY_2PM - 60_000 }, { periodStart: { '1y': 50 } });
    expect(withPeriodChange(original, '1y')).toBe(withPeriodChange(original, '1y'));
    const [traded] = applyLiveTrades([original], [{ symbol: 'AAPL', price: 110, time: TUESDAY_2PM }], TUESDAY_2PM);
    expect(withPeriodChange(traded, '1y').quote!.changePercent).toBeCloseTo(120);
  });
});

describe('volumeSize', () => {
  it('sizes by average shares, or shares times the live price', () => {
    const s = stock({ price: 200 }, { averageVolume: 1_000 });
    expect(volumeSize(s, false)).toBe(1_000);
    expect(volumeSize(s, true)).toBe(200_000);
    expect(volumeSize(stock(undefined, { averageVolume: 1_000 }), true)).toBeUndefined();
    expect(volumeSize(stock({ price: 1 }), false)).toBeUndefined();
  });
});
