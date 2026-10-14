import { describe, expect, it } from 'vitest';
import { joinBars, lastFinalDay, nextFinalAt, readDailyBars } from '@/lib/daily-bars';
import { newYorkMs } from '@/lib/market-data';

const ET = (day: string, h: number, m = 0) => newYorkMs(day, h * 60 + m);
// Alpaca stamps a daily bar with midnight New York time (4:00 or 5:00 UTC)
const bar = (day: string, o: number, c: number, extra: Record<string, unknown> = {}) => ({ t: new Date(newYorkMs(day, 0)).toISOString(), o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1000, ...extra });

describe('which daily bars are final', () => {
  it("counts a session's bar once its after-hours session has ended (8:20 PM New York)", () => {
    expect(lastFinalDay(ET('2026-10-13', 15))).toBe('2026-10-12');
    expect(lastFinalDay(ET('2026-10-13', 20, 19))).toBe('2026-10-12');
    expect(lastFinalDay(ET('2026-10-13', 20, 20))).toBe('2026-10-13');
  });

  it('steps back over weekends and holidays', () => {
    expect(lastFinalDay(ET('2026-10-17', 12))).toBe('2026-10-16'); // Saturday
    expect(lastFinalDay(ET('2026-11-26', 21))).toBe('2026-11-25'); // Thanksgiving
    expect(lastFinalDay(ET('2026-10-19', 9))).toBe('2026-10-16'); // Monday morning
  });

  it('knows when the next bar will be final, including early closes', () => {
    expect(nextFinalAt(ET('2026-10-13', 15))).toBe(ET('2026-10-13', 20, 20));
    expect(nextFinalAt(ET('2026-10-16', 21))).toBe(ET('2026-10-19', 20, 20));
    // Day after Thanksgiving closes at 1:00 PM, after hours end at 5:00 PM
    expect(nextFinalAt(ET('2026-11-26', 12))).toBe(ET('2026-11-27', 17, 20));
  });
});

describe('reading Alpaca daily bars', () => {
  const now = ET('2026-10-14', 10);

  it('keys each bar by its New York day, oldest first, across a daylight-saving change', () => {
    const raw = { bars: { SPY: [bar('2026-11-02', 101, 102), bar('2026-10-30', 100, 101)] } };
    const { bars, skipped } = readDailyBars(raw, 'SPY', ET('2026-11-03', 21));
    expect(bars.days).toEqual(['2026-10-30', '2026-11-02']);
    expect(bars.open).toEqual([100, 101]);
    expect(bars.close).toEqual([101, 102]);
    expect(skipped).toBe(0);
  });

  it("drops today's unfinished bar and skips bad or repeated bars without filling them in", () => {
    const raw = {
      bars: {
        AAPL: [bar('2026-10-09', 10, 11), bar('2026-10-12', 0, 11), bar('2026-10-12', 11, null as unknown as number), bar('2026-10-13', 11, 12), bar('2026-10-13', 11, 12), bar('2026-10-14', 12, 13)],
      },
    };
    const { bars, skipped } = readDailyBars(raw, 'AAPL', now);
    expect(bars.days).toEqual(['2026-10-09', '2026-10-13']);
    expect(skipped).toBe(3);
  });

  it('returns nothing for a symbol the answer lacks or a malformed answer', () => {
    expect(readDailyBars({ bars: {} }, 'ZZZZ', now).bars.days).toEqual([]);
    expect(readDailyBars(null, 'ZZZZ', now).bars.days).toEqual([]);
    expect(readDailyBars({ bars: { X: 'nope' } }, 'X', now).bars.days).toEqual([]);
  });

  it('joins pages without repeating a day', () => {
    const a = readDailyBars({ bars: { X: [bar('2026-10-08', 1, 2), bar('2026-10-09', 2, 3)] } }, 'X', now).bars;
    const b = readDailyBars({ bars: { X: [bar('2026-10-09', 2, 3), bar('2026-10-12', 3, 4)] } }, 'X', now).bars;
    expect(joinBars([a, b]).days).toEqual(['2026-10-08', '2026-10-09', '2026-10-12']);
    expect(joinBars([a, b]).close).toEqual([2, 3, 4]);
  });
});
