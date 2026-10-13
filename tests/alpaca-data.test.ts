import { describe, expect, it } from 'vitest';
import {
  closeAt,
  extendedPlan,
  extendedReference,
  intradayWindow,
  monthAgoWindow,
  newYorkInstant,
  readBars,
  readLatestTrades,
} from '@/lib/alpaca-data';

// New York is UTC−4 in October (EDT) and UTC−5 in December (EST).
// Mon 2026-10-12, Tue 2026-10-13, Fri 2026-10-16, Sat 2026-10-17.
const et = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour + 4, minute);
const MONDAY_CLOSE = et(12, 16);

describe('New York times', () => {
  it('turns a New York wall-clock time into an instant, in summer and winter time', () => {
    expect(newYorkInstant('2026-10-12', 9 * 60 + 30)).toBe(Date.UTC(2026, 9, 12, 13, 30));
    expect(newYorkInstant('2026-12-01', 9 * 60 + 30)).toBe(Date.UTC(2026, 11, 1, 14, 30));
  });
});

describe("reading Alpaca's answers", () => {
  it('keeps bars with a time and a positive close, per symbol', () => {
    const bars = readBars({
      bars: {
        AAPL: [{ t: '2026-10-12T14:00:00Z', o: 1, h: 1, l: 1, c: 250, v: 10 }, { t: 'nope', c: 1 }, { t: '2026-10-12T14:01:00Z', c: 0 }],
        MSFT: 'nope',
      },
    });
    expect([...bars.keys()]).toEqual(['AAPL']);
    expect(bars.get('AAPL')).toHaveLength(1);
    expect(readBars(null).size).toBe(0);
  });

  it('reads the latest trade per symbol', () => {
    const trades = readLatestTrades({ trades: { AAPL: { t: '2026-10-12T12:00:00Z', p: 251.5 }, MSFT: { t: 'x', p: 1 }, NVDA: { t: '2026-10-12T12:00:00Z', p: -1 } } });
    expect([...trades.entries()]).toEqual([['AAPL', { price: 251.5, time: Date.UTC(2026, 9, 12, 12) }]]);
  });

  it("takes the close of the last bar that started by a moment", () => {
    const bars = readBars({ bars: { A: [0, 1, 2].map((minute) => ({ t: new Date(et(12, 10, minute)).toISOString(), c: 100 + minute })) } }).get('A');
    expect(closeAt(bars, et(12, 10, 1) + 30_000)).toEqual({ price: 101, time: et(12, 10, 1) });
    expect(closeAt(bars, et(12, 9, 59))).toBeUndefined();
    expect(closeAt(undefined, et(12, 10))).toBeUndefined();
  });
});

describe('where periods start', () => {
  it('asks for the minutes just before an hour (or 4) earlier', () => {
    const reference = et(12, 14, 30) + 45_000;
    expect(intradayWindow('1h', reference)).toEqual({ start: et(12, 13, 15), end: et(12, 13, 30) });
    expect(intradayWindow('4h', reference)).toEqual({ start: et(12, 9, 30), end: et(12, 10, 30) });
  });

  it('goes back a calendar month, clamping to the end of a shorter month', () => {
    expect(monthAgoWindow('2026-10-12')).toEqual({ start: '2026-09-05', end: '2026-09-12', target: '2026-09-12' });
    expect(monthAgoWindow('2026-03-31')).toEqual({ start: '2026-02-21', end: '2026-02-28', target: '2026-02-28' });
    expect(monthAgoWindow('2026-01-15').target).toBe('2025-12-15');
  });
});

describe('which extended session the map shows', () => {
  it('is live pre-market before the open, measured from the last close', () => {
    const plan = extendedPlan('pre-market', et(13, 8), MONDAY_CLOSE);
    expect(plan).toEqual({ session: 'pre-market', mode: 'live', day: '2026-10-13', window: { start: et(13, 4), end: et(13, 9, 30) }, reference: 'price' });
    expect(extendedReference(plan!, { price: 100, previousClose: 98, time: MONDAY_CLOSE }, et(13, 8))).toBe(100);
    // A quote already from today can't be the close before this pre-market
    expect(extendedReference(plan!, { price: 101, previousClose: 100, time: et(13, 7) }, et(13, 8))).toBeUndefined();
  });

  it("is today's finished pre-market once the market is open, from the previous close", () => {
    const quote = { price: 103, previousClose: 100, time: et(13, 10, 59) };
    const plan = extendedPlan('pre-market', et(13, 11), quote.time);
    expect(plan).toMatchObject({ mode: 'final', day: '2026-10-13', window: { start: et(13, 8, 30), end: et(13, 9, 30) }, reference: 'previousClose' });
    expect(extendedReference(plan!, quote, et(13, 11))).toBe(100);
  });

  it('is live after hours after the close, from the close', () => {
    const quote = { price: 103, previousClose: 100, time: et(13, 16) };
    const plan = extendedPlan('post-market', et(13, 17), quote.time);
    expect(plan).toMatchObject({ mode: 'live', day: '2026-10-13', window: { start: et(13, 16), end: et(13, 20) }, reference: 'price' });
    expect(extendedReference(plan!, quote, et(13, 17))).toBe(103);
  });

  it("is yesterday's after hours during the regular session, from yesterday's close", () => {
    const quote = { price: 103, previousClose: 100, time: et(13, 10, 59) };
    const plan = extendedPlan('post-market', et(13, 11), quote.time);
    expect(plan).toMatchObject({ mode: 'final', day: '2026-10-12', window: { start: et(12, 19), end: et(12, 20) }, reference: 'previousClose' });
    expect(extendedReference(plan!, quote, et(13, 11))).toBe(100);
    // A stock whose quote is still Monday's would be measured from the wrong close
    expect(extendedReference(plan!, { price: 100, previousClose: 99, time: MONDAY_CLOSE }, et(13, 11))).toBeUndefined();
  });

  it("is the last trading day's sessions over a weekend", () => {
    const friday = et(16, 16);
    expect(extendedPlan('post-market', et(17, 12), friday)).toMatchObject({ mode: 'final', day: '2026-10-16', reference: 'price' });
    expect(extendedPlan('pre-market', et(17, 12), friday)).toMatchObject({ mode: 'final', day: '2026-10-16', reference: 'previousClose' });
    expect(extendedPlan('pre-market', et(17, 12), undefined)).toBeUndefined();
  });
});
