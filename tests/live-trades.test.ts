import { describe, expect, it } from 'vitest';
import { mergeHeatmapStocks } from '@/hooks/useHeatmapFeed';
import { applyLiveTrades, latestTrades, newerQuote, pickStreamSymbols, STREAM_SYMBOL_LIMIT } from '@/lib/live-trades';
import type { HeatmapStock } from '@/lib/market-data';

// Mon Oct 12 2026: 10:00, 10:01 and 16:30 in New York (EDT, UTC−4), and the previous Friday's close
const AT_10 = Date.UTC(2026, 9, 12, 14, 0);
const AT_1001 = AT_10 + 60_000;
const AFTER_HOURS = Date.UTC(2026, 9, 12, 20, 30);
const FRIDAY_CLOSE = Date.UTC(2026, 9, 9, 20, 0);

const stock = (symbol: string, price: number, time: number, extra: Partial<HeatmapStock> = {}): HeatmapStock => ({
  symbol,
  name: symbol,
  sector: 'Information Technology',
  industry: '',
  marketCap: 1000,
  quote: { price, previousClose: 100, change: price - 100, changePercent: price - 100, dayHigh: 102, dayLow: 99, time },
  ...extra,
});

describe('picking the stocks to stream', () => {
  it('takes the largest by market cap, up to the free limit', () => {
    const stocks = Array.from({ length: 54 }, (_, i) => ({ symbol: `S${i}`, marketCap: i === 3 ? undefined : 1000 - i }));
    const picked = pickStreamSymbols(stocks);
    expect(picked).toHaveLength(STREAM_SYMBOL_LIMIT);
    expect(picked[0]).toBe('S0');
    expect(picked).not.toContain('S3');
    expect(picked).not.toContain('S53');
  });
});

describe("reading Finnhub's trade messages", () => {
  const wanted = new Set(['AAPL', 'MSFT']);

  it('keeps the newest trade per wanted symbol and session, tagged with the session', () => {
    const trades = latestTrades(
      {
        type: 'trade',
        data: [
          { s: 'AAPL', p: 101, t: AT_10 },
          { s: 'AAPL', p: 102, t: AT_1001 },
          { s: 'AAPL', p: 100.5, t: AT_10 + 1 },
          { s: 'MSFT', p: 400, t: AFTER_HOURS },
          { s: 'NVDA', p: 180, t: AT_10 },
          { s: 'MSFT', p: 0, t: AT_10 },
          { s: 'MSFT', p: 'x', t: AT_10 },
        ],
      },
      wanted
    );
    expect(trades).toEqual([
      { symbol: 'AAPL', price: 102, time: AT_1001, session: 'regular' },
      { symbol: 'MSFT', price: 400, time: AFTER_HOURS, session: 'post-market' },
    ]);
  });

  it('ignores pings and anything that isn\'t a trade list', () => {
    expect(latestTrades({ type: 'ping' }, wanted)).toEqual([]);
    expect(latestTrades(null, wanted)).toEqual([]);
    expect(latestTrades({ type: 'trade', data: 'nope' }, wanted)).toEqual([]);
  });
});

describe('applying live trades to the map', () => {
  it('moves the price, change and day range, and marks when the page got it', () => {
    const stocks = [stock('AAPL', 101, AT_10), stock('MSFT', 99.5, AT_10)];
    const next = applyLiveTrades(stocks, [{ symbol: 'AAPL', price: 103, time: AT_1001 }], 5);
    expect(next[0].quote).toMatchObject({ price: 103, change: 3, changePercent: 3, dayHigh: 103, dayLow: 99, time: AT_1001 });
    expect(next[0].fetchedAt).toBe(5);
    expect(next[1]).toBe(stocks[1]);
  });

  it('ignores trades older than the quote, from another day, or for stocks without a quote', () => {
    const stocks = [stock('AAPL', 101, AT_1001), stock('MSFT', 99, FRIDAY_CLOSE), { ...stock('NVDA', 1, AT_10), quote: undefined }];
    const next = applyLiveTrades(
      stocks,
      [
        { symbol: 'AAPL', price: 90, time: AT_10 },
        { symbol: 'MSFT', price: 120, time: AT_10 },
        { symbol: 'NVDA', price: 180, time: AT_10 },
      ],
      5
    );
    expect(next).toBe(stocks);
  });
});

describe('a refresh after live trades', () => {
  it("doesn't undo a live price with an older cached one", () => {
    const live = [stock('AAPL', 103, AT_1001)];
    const merged = mergeHeatmapStocks(live, [stock('AAPL', 101, AT_10)]);
    expect(merged).toBe(live);
  });

  it('takes a newer refreshed quote, and the refreshed one on a tie', () => {
    const live = [stock('AAPL', 103, AT_1001)];
    expect(mergeHeatmapStocks(live, [stock('AAPL', 104, AT_1001 + 1)])[0].quote?.price).toBe(104);
    const a = stock('AAPL', 1, AT_10).quote;
    const b = stock('AAPL', 2, AT_10).quote;
    expect(newerQuote(a, b)).toBe(b);
  });
});
