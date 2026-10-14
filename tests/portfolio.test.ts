import { describe, expect, it } from 'vitest';
import { runBacktest } from '@/lib/backtest';
import { DEFAULT_SETTINGS, backtestInput, equalWeights, neededSymbols, newPortfolio, parsePortfolioDoc, rangeStart, totalWeight } from '@/lib/portfolio';

describe('portfolio settings', () => {
  it('splits 100% into equal weights with two decimals that add up exactly', () => {
    expect(equalWeights(3)).toEqual([33.34, 33.33, 33.33]);
    expect(equalWeights(4)).toEqual([25, 25, 25, 25]);
    expect(totalWeight(equalWeights(7).map((weight, i) => ({ symbol: `S${i}`, weight })))).toBe(100);
    expect(equalWeights(0)).toEqual([]);
  });

  it('starts a 1, 3 or 5 year range on the same calendar day, and leaves Max open', () => {
    expect(rangeStart({ ...DEFAULT_SETTINGS, range: '1y' }, '2026-10-13')).toEqual({ start: '2025-10-13' });
    expect(rangeStart({ ...DEFAULT_SETTINGS, range: '5y' }, '2024-02-29')).toEqual({ start: '2019-03-01' });
    expect(rangeStart({ ...DEFAULT_SETTINGS, range: 'max' }, '2026-10-13')).toEqual({});
    expect(rangeStart({ ...DEFAULT_SETTINGS, range: 'custom', start: '2020-01-02', end: '2021-01-04' }, '2026-10-13')).toEqual({ start: '2020-01-02', end: '2021-01-04' });
  });

  it('checks a saved document field by field', () => {
    const doc = parsePortfolioDoc({
      version: 1,
      activeId: 'gone',
      portfolios: [
        { id: 'a', name: '  Core  ', holdings: [{ symbol: 'aapl', weight: 50.555 }, { symbol: 'AAPL', weight: 10 }, { symbol: 'bad symbol!', weight: 5 }, { symbol: 'SPY', weight: 'x' }], settings: { range: 'weird', costBps: 9999, window: 3.4, benchmark: 'nasdaq:qqq' } },
        { id: 'a', name: 'duplicate', holdings: [] },
      ],
    });
    expect(doc?.activeId).toBe('a');
    expect(doc?.portfolios).toHaveLength(1);
    expect(doc?.portfolios[0].name).toBe('Core');
    expect(doc?.portfolios[0].holdings).toEqual([{ symbol: 'AAPL', weight: 50.56 }, { symbol: 'SPY', weight: 0 }]);
    expect(doc?.portfolios[0].settings).toMatchObject({ range: '5y', costBps: 500, window: 5, benchmark: 'QQQ' });
    expect(parsePortfolioDoc({ version: 2, portfolios: [] })).toBeUndefined();
    expect(parsePortfolioDoc(null)).toBeUndefined();
  });

  it('builds the backtest input with weights as fractions and the benchmark included', () => {
    const portfolio = { ...newPortfolio('p'), holdings: [{ symbol: 'AAA', weight: 60 }, { symbol: 'BBB', weight: 40 }] };
    expect(neededSymbols(portfolio)).toEqual(['AAA', 'BBB', 'SPY']);
    const input = backtestInput(portfolio, {}, '2026-10-13');
    expect(input.holdings).toEqual([{ symbol: 'AAA', weight: 0.6 }, { symbol: 'BBB', weight: 0.4 }]);
    expect(input).toMatchObject({ start: '2021-10-13', rebalance: 'quarterly', costBps: 5, outOfSample: 0.3, strategy: { kind: 'hold' } });
    // Weights that add to 100% in cents pass the backtest's check
    const thirds = { ...portfolio, holdings: equalWeights(3).map((weight, i) => ({ symbol: ['A', 'B', 'C'][i], weight })) };
    expect(runBacktest(backtestInput(thirds, {}, '2026-10-13'))).toEqual({ ok: false, reason: 'No daily prices for A, B, C, SPY.' });
  });
});
