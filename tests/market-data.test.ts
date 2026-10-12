import { describe, expect, it } from 'vitest';
import { mergeHeatmapStocks } from '@/hooks/useHeatmapFeed';
import {
  BEHIND_OTHERS_MS,
  STALE_IN_SESSION_MS,
  STALE_WHEN_CLOSED_MS,
  assessStocks,
  capWeightedChange,
  describeDailyPeriod,
  formatNewYorkMoment,
  newYorkClock,
  normalizeQuote,
  periodPhrase,
  quotePeriodPhrase,
  quoteFreshness,
  sameCompany,
  sameListing,
  sessionFromClock,
  type HeatmapStock,
} from '@/lib/market-data';
import { formatChangePercent, getChangeColorClass, formatSignedNumber } from '@/lib/utils';

// Friday 2026-10-09, New York is on daylight time (UTC−4)
const FRI_1100_ET = Date.parse('2026-10-09T15:00:00Z');
const FRI_1600_ET = Date.parse('2026-10-09T20:00:00Z');
const SUN_1200_ET = Date.parse('2026-10-11T16:00:00Z');

describe('normalizeQuote', () => {
  const raw = { c: 101, d: 1, dp: 1, h: 102, l: 99, o: 100, pc: 100, t: 1791576000 };

  it('reads a Finnhub quote', () => {
    expect(normalizeQuote(raw, FRI_1600_ET + 60_000)).toEqual({
      price: 101,
      previousClose: 100,
      change: 1,
      changePercent: 1,
      open: 100,
      dayHigh: 102,
      dayLow: 99,
      time: 1791576000 * 1000,
    });
  });

  it('works the change out from the previous close, so dollars and percent always agree', () => {
    const q = normalizeQuote({ ...raw, c: 97.5, d: 999, dp: 999 }, FRI_1600_ET)!;
    expect(q.change).toBeCloseTo(-2.5);
    expect(q.changePercent).toBeCloseTo(-2.5);
  });

  it("falls back to Finnhub's own change only without a previous close", () => {
    const q = normalizeQuote({ c: 50, d: -1, dp: -1.96, pc: 0 }, FRI_1600_ET)!;
    expect(q.previousClose).toBeUndefined();
    expect(q.change).toBe(-1);
    expect(q.changePercent).toBe(-1.96);
  });

  it('treats a zero price (Finnhub\'s answer for an unknown symbol) as no quote, never $0', () => {
    expect(normalizeQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })).toBeUndefined();
  });

  it('rejects malformed answers', () => {
    expect(normalizeQuote(null)).toBeUndefined();
    expect(normalizeQuote('<html>')).toBeUndefined();
    expect(normalizeQuote({ c: '101' })).toBeUndefined();
    expect(normalizeQuote({ c: Number.NaN })).toBeUndefined();
    expect(normalizeQuote({ c: -5 })).toBeUndefined();
  });

  it('drops individual figures that are missing or impossible', () => {
    const q = normalizeQuote({ c: 10, pc: 10, h: 9, l: 11, o: 0 }, FRI_1600_ET)!;
    expect(q.dayHigh).toBeUndefined();
    expect(q.dayLow).toBeUndefined();
    expect(q.open).toBeUndefined();
    expect(q.change).toBe(0);
  });

  it('turns the timestamp into milliseconds and distrusts one from the future', () => {
    expect(normalizeQuote({ c: 1, t: 1_791_576_000_000 }, FRI_1600_ET + 1)!.time).toBe(1_791_576_000_000);
    expect(normalizeQuote({ c: 1, t: (FRI_1600_ET + 60 * 60_000) / 1000 }, FRI_1600_ET)!.time).toBeUndefined();
    expect(normalizeQuote({ c: 1 }, FRI_1600_ET)!.time).toBeUndefined();
  });
});

describe('which listing an answer is for', () => {
  it('treats the ways of writing a share class as one listing', () => {
    expect(sameListing('BRK.B', 'brk-b')).toBe(true);
    expect(sameListing('BRK/B', 'BRK.B')).toBe(true);
    expect(sameListing('BRK.A', 'BRK.B')).toBe(false);
  });

  it("accepts another share class's profile as the same company, as Finnhub answers BRK.B with BRK.A's", () => {
    expect(sameCompany('BRK.A', 'BRK.B')).toBe(true);
    expect(sameCompany('BF-B', 'BF.A')).toBe(true);
    expect(sameCompany('AAPL', 'AAPL')).toBe(true);
  });

  it('rejects a profile for a different company', () => {
    expect(sameCompany('BRKR', 'BRK.B')).toBe(false);
    expect(sameCompany('GOOG', 'GOOGL')).toBe(false);
    expect(sameCompany('2330.TW', 'TSM')).toBe(false);
  });
});

describe('the New York clock', () => {
  it('reads New York time in summer and winter', () => {
    expect(newYorkClock(FRI_1100_ET)).toEqual({ weekday: 'Fri', day: '2026-10-09', minutes: 11 * 60 });
    expect(newYorkClock(Date.parse('2026-12-07T14:30:00Z'))).toMatchObject({ weekday: 'Mon', minutes: 9 * 60 + 30 });
  });

  it('knows the trading sessions', () => {
    expect(sessionFromClock(Date.parse('2026-10-09T07:59:00Z'))).toBe('closed');
    expect(sessionFromClock(Date.parse('2026-10-09T08:00:00Z'))).toBe('pre-market');
    expect(sessionFromClock(Date.parse('2026-10-09T13:29:00Z'))).toBe('pre-market');
    expect(sessionFromClock(Date.parse('2026-10-09T13:30:00Z'))).toBe('regular');
    expect(sessionFromClock(Date.parse('2026-10-09T19:59:00Z'))).toBe('regular');
    expect(sessionFromClock(FRI_1600_ET)).toBe('post-market');
    expect(sessionFromClock(Date.parse('2026-10-10T00:00:00Z'))).toBe('closed');
    expect(sessionFromClock(Date.parse('2026-10-10T15:00:00Z'))).toBe('closed');
    expect(sessionFromClock(Date.parse('2026-12-07T14:30:00Z'))).toBe('regular');
  });

  it('adds the day to a time from another day', () => {
    expect(formatNewYorkMoment(FRI_1600_ET, FRI_1600_ET + 60_000)).toBe('4:00 PM ET');
    expect(formatNewYorkMoment(FRI_1600_ET, SUN_1200_ET)).toBe('Fri, Oct 9, 4:00 PM ET');
  });
});

describe('describeDailyPeriod', () => {
  it("calls it today's move during the session", () => {
    expect(describeDailyPeriod('regular', FRI_1100_ET, FRI_1100_ET)).toEqual({ label: 'Today', live: true });
  });

  it("calls it today's move after the close on the same day, but not live", () => {
    expect(describeDailyPeriod('post-market', FRI_1600_ET, FRI_1600_ET + 3_600_000)).toEqual({ label: 'Today', live: false });
  });

  it('calls it the last session on a weekend, with its day', () => {
    const period = describeDailyPeriod('closed', FRI_1600_ET, SUN_1200_ET);
    expect(period).toEqual({ label: 'Last session', day: 'Fri, Oct 9', live: false });
    expect(periodPhrase(period)).toBe('in the last session, Fri, Oct 9');
  });

  it('calls it the last session before the open', () => {
    const mondayPreMarket = Date.parse('2026-10-12T12:00:00Z');
    expect(describeDailyPeriod('pre-market', FRI_1600_ET, mondayPreMarket).label).toBe('Last session');
  });

  it("keeps calling it the last session after the open until today's prices arrive", () => {
    const mondayOpen = Date.parse('2026-10-12T13:35:00Z');
    expect(describeDailyPeriod('regular', FRI_1600_ET, mondayOpen)).toEqual({ label: 'Last session', day: 'Fri, Oct 9', live: false });
    expect(describeDailyPeriod('regular', mondayOpen - 60_000, mondayOpen)).toEqual({ label: 'Today', live: true });
    expect(describeDailyPeriod('regular', undefined, mondayOpen)).toEqual({ label: 'Today', live: true });
  });
});

describe('quotePeriodPhrase', () => {
  it("describes each stock's change by its own price time", () => {
    expect(quotePeriodPhrase(FRI_1100_ET, FRI_1600_ET, 'today')).toBe('today');
    expect(quotePeriodPhrase(FRI_1600_ET, Date.parse('2026-10-12T13:35:00Z'), 'today')).toBe('on Fri, Oct 9');
    expect(quotePeriodPhrase(undefined, FRI_1600_ET, 'in the last session, Fri, Oct 9')).toBe('in the last session, Fri, Oct 9');
  });
});

describe('quoteFreshness', () => {
  const quote = (time?: number) => ({ price: 10, time });

  it('is missing without a quote and stale without a time', () => {
    expect(quoteFreshness(undefined, { now: FRI_1100_ET, session: 'regular' })).toBe('missing');
    expect(quoteFreshness(quote(undefined), { now: FRI_1100_ET, session: 'regular' })).toBe('stale');
  });

  it('allows 15 minutes during the session', () => {
    expect(quoteFreshness(quote(FRI_1100_ET - STALE_IN_SESSION_MS), { now: FRI_1100_ET, session: 'regular' })).toBe('fresh');
    expect(quoteFreshness(quote(FRI_1100_ET - STALE_IN_SESSION_MS - 1), { now: FRI_1100_ET, session: 'regular' })).toBe('stale');
  });

  it('flags a price far behind the newest one on the map', () => {
    const newest = FRI_1600_ET;
    expect(quoteFreshness(quote(newest - BEHIND_OTHERS_MS - 1), { now: SUN_1200_ET, session: 'closed', newestQuoteTime: newest })).toBe('stale');
    expect(quoteFreshness(quote(newest - 60_000), { now: SUN_1200_ET, session: 'closed', newestQuoteTime: newest })).toBe('fresh');
  });

  it("accepts the last session's close over a weekend, but not for longer than a long weekend", () => {
    expect(quoteFreshness(quote(FRI_1600_ET), { now: SUN_1200_ET, session: 'closed' })).toBe('fresh');
    expect(quoteFreshness(quote(FRI_1600_ET), { now: FRI_1600_ET + STALE_WHEN_CLOSED_MS + 1, session: 'closed' })).toBe('stale');
  });
});

const stock = (symbol: string, marketCap?: number, changePercent?: number, time = FRI_1100_ET): HeatmapStock => ({
  symbol,
  name: symbol,
  sector: 'Energy',
  industry: '',
  marketCap,
  quote: changePercent === undefined ? undefined : { price: 10, changePercent, time },
});

describe('capWeightedChange', () => {
  it('weights each move by market cap', () => {
    const result = capWeightedChange([stock('A', 300, 1), stock('B', 100, -1)]);
    expect(result.changePercent).toBeCloseTo(0.5);
    expect(result).toMatchObject({ counted: 2, total: 2 });
  });

  it('leaves out stocks missing either figure, and says so', () => {
    const result = capWeightedChange([stock('A', 300, 2), stock('B', undefined, -5), stock('C', 100)]);
    expect(result.changePercent).toBeCloseTo(2);
    expect(result).toMatchObject({ counted: 1, total: 3 });
  });

  it('has no figure when nothing counts', () => {
    expect(capWeightedChange([stock('A')]).changePercent).toBeUndefined();
    expect(capWeightedChange([]).changePercent).toBeUndefined();
  });

  it("counts only current prices when given freshness, so it never mixes two sessions' moves", () => {
    const stocks = [stock('A', 300, 1), stock('B', 100, 5), stock('C', 100)];
    const freshness = new Map([['A', 'fresh'], ['B', 'stale'], ['C', 'missing']] as const);
    const result = capWeightedChange(stocks, freshness);
    expect(result.changePercent).toBeCloseTo(1);
    expect(result).toMatchObject({ counted: 1, stale: 1, total: 3 });
  });
});

describe('assessStocks', () => {
  it('counts priced, stale and missing stocks', () => {
    const now = FRI_1100_ET;
    const result = assessStocks([stock('A', 1, 1, now), stock('B', 1, 1, now - 40 * 60_000), stock('C', 1)], { now, session: 'regular' });
    expect(result).toMatchObject({ priced: 2, stale: 1, missing: 1, newestQuoteTime: now });
    expect(result.freshness.get('B')).toBe('stale');
    expect(result.period.label).toBe('Today');
  });
});

describe('mergeHeatmapStocks', () => {
  const withQuote = (price: number, time: number, fetchedAt: number): HeatmapStock => ({ ...stock('A', 100), quote: { price, time, changePercent: 1 }, fetchedAt });

  it('keeps the last quote, with its own times, when a refresh misses it', () => {
    const before = withQuote(10, 1000, 2000);
    const [merged] = mergeHeatmapStocks([before], [{ ...stock('A', 100), quote: undefined, fetchedAt: undefined }]);
    expect(merged.quote).toEqual(before.quote);
    expect(merged.fetchedAt).toBe(2000);
  });

  it('takes a new quote whole, never mixing figures from two moments', () => {
    const [merged] = mergeHeatmapStocks([withQuote(10, 1000, 2000)], [withQuote(11, 3000, 4000)]);
    expect(merged.quote).toEqual({ price: 11, time: 3000, changePercent: 1 });
    expect(merged.fetchedAt).toBe(4000);
  });

  it('returns the same object when nothing changed, so its tile does not redraw', () => {
    const before = withQuote(10, 1000, 2000);
    const [merged] = mergeHeatmapStocks([before], [withQuote(10, 1000, 2000)]);
    expect(merged).toBe(before);
  });

  it('returns the previous list itself when no stock changed, so nothing computed from it is redone', () => {
    const previous = [withQuote(10, 1000, 2000), { ...stock('B', 50), quote: { price: 5, time: 1000, changePercent: -1 }, fetchedAt: 2000 }];
    expect(mergeHeatmapStocks(previous, previous.map((s) => ({ ...s, quote: s.quote && { ...s.quote } })))).toBe(previous);
    const changed = mergeHeatmapStocks(previous, [withQuote(10, 1000, 2000), { ...previous[1], quote: { price: 6, time: 3000, changePercent: 1 }, fetchedAt: 4000 }]);
    expect(changed).not.toBe(previous);
    expect(changed[0]).toBe(previous[0]);
  });

  it('follows the order and membership of the new answer', () => {
    const merged = mergeHeatmapStocks([stock('A'), stock('B')], [stock('B'), stock('C')]);
    expect(merged.map((s) => s.symbol)).toEqual(['B', 'C']);
  });
});

describe('formatting', () => {
  it('never shows "-0.00%" or colors a move that rounds to nothing', () => {
    expect(formatChangePercent(-0.001)).toBe('0.00%');
    expect(formatChangePercent(0.004)).toBe('0.00%');
    expect(getChangeColorClass(-0.004)).toBe('text-gray-400');
    expect(formatSignedNumber(-0.001)).not.toContain('-0');
  });

  it('signs real moves', () => {
    expect(formatChangePercent(1.234)).toBe('+1.23%');
    expect(formatChangePercent(-1.235)).toBe('-1.24%');
    expect(getChangeColorClass(0.5)).toContain('green');
    expect(getChangeColorClass(-0.5)).toContain('red');
  });

  it('shows nothing for a missing figure', () => {
    expect(formatChangePercent(undefined)).toBe('');
    expect(formatChangePercent(Number.NaN)).toBe('');
  });
});
