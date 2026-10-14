import { describe, expect, it } from 'vitest';
import { beta, computeStats, correlation, runBacktest, yearlyReturns, type BacktestInput, type PriceSeries } from '@/lib/backtest';
import { addDays, nextTradingDay } from '@/lib/market-calendar';

// `count` trading days from `first`
const sessions = (first: string, count: number) => {
  const days: string[] = [];
  let day = nextTradingDay(first);
  while (days.length < count) {
    days.push(day);
    day = nextTradingDay(addDays(day, 1));
  }
  return days;
};

// A series where each day's open and close come from functions of the day's position
const series = (days: string[], open: (i: number) => number, close: (i: number) => number = open): PriceSeries => ({
  days,
  open: days.map((_, i) => open(i)),
  close: days.map((_, i) => close(i)),
});

const flat = (days: string[], price = 100) => series(days, () => price);

const base = (overrides: Partial<BacktestInput>): BacktestInput => ({
  series: {},
  holdings: [],
  benchmark: 'SPY',
  rebalance: 'none',
  costBps: 0,
  strategy: { kind: 'hold' },
  outOfSample: 0,
  capital: 10_000,
  ...overrides,
});

const ok = (input: BacktestInput) => {
  const result = runBacktest(input);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe('portfolio statistics', () => {
  it('measures return, drawdown and volatility from the money put in', () => {
    // 100 → 110 (+10%) → 99 (−10%): total −1%, worst fall 99/110 − 1 = −10%
    const stats = computeStats(['2024-01-02', '2024-01-03'], [110, 99], 100);
    expect(stats.totalReturn).toBeCloseTo(-0.01, 12);
    expect(stats.maxDrawdown).toBeCloseTo(-0.1, 12);
    expect(stats.drawdownPeak).toBe('2024-01-02');
    expect(stats.drawdownTrough).toBe('2024-01-03');
    // Sample standard deviation of [+0.1, −0.1] is √0.02 = 0.141421; × √252 a year
    expect(stats.volatility).toBeCloseTo(Math.sqrt(0.02) * Math.sqrt(252), 10);
    expect(stats.sharpe).toBeCloseTo(0, 12);
    expect(stats.bestDay).toBeCloseTo(0.1, 12);
    expect(stats.worstDay).toBeCloseTo(-0.1, 12);
    // Under a year: no annualized return
    expect(stats.annualReturn).toBeUndefined();
  });

  it('annualizes over calendar time for a year or more', () => {
    // 2024-01-01 to the end of 2024-12-31 is 366 days = 366/365.25 years
    const stats = computeStats(['2024-01-01', '2024-12-31'], [100, 121], 100);
    expect(stats.annualReturn).toBeCloseTo(1.21 ** (365.25 / 366) - 1, 12);
  });

  it('computes correlation and beta of daily returns', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeUndefined();
    // Moves twice as much as the market: beta 2
    expect(beta([2, 4, 6], [1, 2, 3])).toBeCloseTo(2, 12);
  });

  it('splits returns by calendar year and marks partial years', () => {
    const years = yearlyReturns(['2023-12-28', '2023-12-29', '2024-01-02', '2024-01-03'], [100, 110, 121, 110], [100, 100, 100, 100], 100);
    expect(years.map((y) => y.year)).toEqual(['2023', '2024']);
    expect(years[0].portfolio).toBeCloseTo(0.1, 12); // 110 / 100 − 1
    expect(years[1].portfolio).toBeCloseTo(0, 12); // 110 / 110 − 1
    expect(years.every((y) => y.partial)).toBe(true);
    // A full year: its first and last sessions
    const full = yearlyReturns(['2025-01-02', '2025-12-31'], [100, 120], [100, 100], 100);
    expect(full[0].partial).toBe(false);
  });
});

describe('backtest', () => {
  const days = sessions('2024-01-02', 40);

  it('buys at the first open and marks the value at each close', () => {
    // Bought at 100, closes 100 + i: value = 10,000 × close / 100
    const result = ok(base({ series: { AAA: series(days, () => 100, (i) => 100 + i), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }] }));
    expect(result.portfolio[0]).toBeCloseTo(10_000, 9);
    expect(result.portfolio[39]).toBeCloseTo(13_900, 9);
    expect(result.full.portfolio.totalReturn).toBeCloseTo(0.39, 12);
    expect(result.benchmark[39]).toBeCloseTo(10_000, 9);
    expect(result.trades).toBe(1);
  });

  it('takes costs out of the money traded', () => {
    // 10 bps on the first purchase: V' = 10,000 − 0.001 × V' → V' = 10,000 / 1.001
    const result = ok(base({ series: { AAA: flat(days), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }], costBps: 10 }));
    expect(result.portfolio[39]).toBeCloseTo(10_000 / 1.001, 6);
    expect(result.costs).toBeCloseTo(10_000 - 10_000 / 1.001, 6);
  });

  it('rebalances at the open of the first session of a new month', () => {
    // A stays at 100. B is 100 in January, opens February at 200, then falls back to 100 on its 10th February session.
    const feb = days.findIndex((d) => d.startsWith('2024-02'));
    const b = (i: number) => (i < feb ? 100 : i < feb + 9 ? 200 : 100);
    const input = base({
      series: { A: flat(days), B: series(days, b), SPY: flat(days) },
      holdings: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }],
    });
    // Held: 50 A + 50 B. At 200: 5,000 + 10,000 = 15,000; back at 100: 10,000
    expect(ok(input).portfolio[39]).toBeCloseTo(10_000, 9);
    // Monthly: at February's open, 15,000 split 7,500 / 7,500 = 75 A + 37.5 B; back at 100: 7,500 + 3,750 = 11,250
    const monthly = ok({ ...input, rebalance: 'monthly' });
    expect(monthly.portfolio[feb]).toBeCloseTo(15_000, 9);
    expect(monthly.portfolio[39]).toBeCloseTo(11_250, 9);
  });

  it('acts on a trend signal only at the next open (no look-ahead)', () => {
    // Flat at 100 for 10 sessions: never above its 5-day average, so in cash.
    // Session 10 closes at 110 (average (4 × 100 + 110) / 5 = 102): the signal turns on at that close.
    // Session 11 opens at 110 and closes at 121: bought at 110, value 10,000 × 121 / 110 = 11,000.
    const open = (i: number) => (i <= 10 ? 100 : i === 11 ? 110 : 121);
    const close = (i: number) => (i < 10 ? 100 : i === 10 ? 110 : 121);
    const result = ok(base({ series: { AAA: series(days, open, close), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }], strategy: { kind: 'trend', window: 5 } }));
    expect(result.portfolio[10]).toBeCloseTo(10_000, 9);
    expect(result.portfolio[11]).toBeCloseTo(11_000, 9);
  });

  it('sells to cash when the trend turns down, at the next open', () => {
    // Rising 100, 101, ...: above its average after 5 sessions, bought at session 5's open (105).
    // Session 20 closes at 50: off at that close, sold at session 21's open (50).
    const open = (i: number) => (i <= 20 ? 100 + i : 50);
    const close = (i: number) => (i < 20 ? 100 + i : 50);
    const result = ok(base({ series: { AAA: series(days, open, close), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }], strategy: { kind: 'trend', window: 5 } }));
    // Shares = 10,000 / 105; sold at 50 → 10,000 × 50 / 105, then cash stays put
    expect(result.portfolio[21]).toBeCloseTo((10_000 * 50) / 105, 6);
    expect(result.portfolio[39]).toBeCloseTo((10_000 * 50) / 105, 6);
    expect(result.trades).toBe(2);
  });

  it('holds out the last sessions as out-of-sample', () => {
    const result = ok(base({ series: { AAA: flat(days), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }], outOfSample: 0.5 }));
    expect(result.splitDay).toBe(days[20]);
    expect(result.segments.map((s) => s.portfolio.sessions)).toEqual([20, 20]);
    const tooShort = ok(base({ series: { AAA: flat(days), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }], outOfSample: 0.25 }));
    expect(tooShort.segments).toEqual([]);
    expect(tooShort.notes.join(' ')).toMatch(/Too few sessions/);
  });

  it('uses only sessions every holding has and says what it left out', () => {
    const gap = { ...flat(days), days: days.filter((_, i) => i !== 5), open: days.slice(1).map(() => 100), close: days.slice(1).map(() => 100) };
    const late = flat(days.slice(3));
    const result = ok(base({ series: { A: gap, B: late, SPY: flat(days) }, holdings: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }], start: days[0] }));
    expect(result.days[0]).toBe(days[3]);
    expect(result.days).not.toContain(days[5]);
    expect(result.notes.join(' ')).toMatch(/B begins/);
    expect(result.notes.join(' ')).toMatch(/1 session\(s\) left out/);
  });

  it('refuses inputs it cannot test honestly', () => {
    const data = { AAA: flat(days), SPY: flat(days) };
    expect(runBacktest(base({ series: data, holdings: [] })).ok).toBe(false);
    expect(runBacktest(base({ series: data, holdings: [{ symbol: 'AAA', weight: 0.9 }] }))).toEqual({ ok: false, reason: 'Weights must add up to 100%.' });
    expect(runBacktest(base({ series: data, holdings: [{ symbol: 'ZZZ', weight: 1 }] }))).toEqual({ ok: false, reason: 'No daily prices for ZZZ.' });
    expect(runBacktest(base({ series: { AAA: flat(days.slice(0, 10)), SPY: flat(days) }, holdings: [{ symbol: 'AAA', weight: 1 }] })).ok).toBe(false);
  });

  it('reports each holding bought and held, and their correlations', () => {
    // A closes 100, 110, 100, ...; B the opposite: their daily returns move exactly against each other
    const result = ok(base({
      series: { A: series(days, () => 100, (i) => (i % 2 ? 110 : 100)), B: series(days, () => 100, (i) => (i % 2 ? 100 : 110)), SPY: flat(days) },
      holdings: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }],
    }));
    // Bought at 100; last close (session 39, odd) is 110 for A and 100 for B
    expect(result.assets[0].stats.totalReturn).toBeCloseTo(0.1, 12);
    expect(result.assets[1].stats.totalReturn).toBeCloseTo(0, 12);
    expect(result.correlations[0][0]).toBe(1);
    expect(result.correlations[0][1]).toBeCloseTo(-1, 12);
  });
});
