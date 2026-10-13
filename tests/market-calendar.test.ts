import { describe, expect, it } from 'vitest';
import { closeMinutes, isTradingDay, marketHoliday, marketHolidays, nextTradingDay } from '@/lib/market-calendar';
import { marketTtlMs, newYorkMs, nextOpenMs, sessionFromClock } from '@/lib/market-data';

const HOUR = 60 * 60_000;
// New York wall-clock time on a day, through the code under test's own conversion checked separately below
const ET = (day: string, h: number, m = 0) => newYorkMs(day, h * 60 + m);

describe('market holidays', () => {
  it("matches the exchange's published 2026 holidays", () => {
    expect([...marketHolidays(2026).keys()].sort()).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
      '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ]);
  });

  it('moves weekend holidays to the nearest weekday, except a Saturday New Year', () => {
    expect(marketHoliday('2027-06-18')).toBe('Juneteenth');
    expect(marketHoliday('2027-07-05')).toBe('Independence Day');
    expect(marketHoliday('2027-12-24')).toBe('Christmas Day');
    expect(marketHoliday('2027-03-26')).toBe('Good Friday');
    // 2028 starts on a Saturday: the exchange trades on Friday Dec 31, 2027
    expect(isTradingDay('2027-12-31')).toBe(true);
    expect([...marketHolidays(2028).keys()]).not.toContain('2027-12-31');
  });

  it('knows weekends and the early closes', () => {
    expect(isTradingDay('2026-10-10')).toBe(false);
    expect(isTradingDay('2026-10-12')).toBe(true); // Columbus Day: the stock market is open
    expect(closeMinutes('2026-11-27')).toBe(13 * 60); // day after Thanksgiving
    expect(closeMinutes('2026-12-24')).toBe(13 * 60);
    expect(closeMinutes('2025-07-03')).toBe(13 * 60);
    expect(closeMinutes('2026-10-13')).toBe(16 * 60);
    expect(nextTradingDay('2026-11-26')).toBe('2026-11-27');
  });
});

describe('New York time', () => {
  it('follows daylight saving time', () => {
    expect(newYorkMs('2026-03-06', 570)).toBe(Date.UTC(2026, 2, 6, 14, 30)); // EST, UTC−5
    expect(newYorkMs('2026-03-09', 570)).toBe(Date.UTC(2026, 2, 9, 13, 30)); // EDT from Mar 8
    expect(newYorkMs('2026-11-02', 570)).toBe(Date.UTC(2026, 10, 2, 14, 30)); // EST from Nov 1
  });

  it('works out the session from the calendar', () => {
    expect(sessionFromClock(ET('2026-10-13', 10, 42))).toBe('regular');
    expect(sessionFromClock(ET('2026-11-26', 10))).toBe('closed'); // Thanksgiving
    expect(sessionFromClock(ET('2026-11-27', 13, 30))).toBe('post-market'); // early close
    expect(sessionFromClock(ET('2026-11-27', 17, 30))).toBe('closed');
    expect(sessionFromClock(ET('2026-10-13', 8))).toBe('pre-market');
  });

  it('finds the next open across weekends and holidays', () => {
    expect(nextOpenMs(ET('2026-10-13', 8))).toBe(ET('2026-10-13', 9, 30));
    expect(nextOpenMs(ET('2026-10-09', 17))).toBe(ET('2026-10-12', 9, 30));
    expect(nextOpenMs(ET('2026-11-25', 17))).toBe(ET('2026-11-27', 9, 30));
    expect(nextOpenMs(ET('2026-12-31', 17))).toBe(ET('2027-01-04', 9, 30));
  });
});

describe('marketTtlMs', () => {
  const FIVE = 5 * 60_000;

  it('uses the regular time during the session', () => {
    expect(marketTtlMs(ET('2026-10-13', 10, 42), FIVE)).toBe(FIVE);
  });

  it('keeps refreshing for 20 minutes after the close to catch the closing prices', () => {
    expect(marketTtlMs(ET('2026-10-13', 16, 5), FIVE)).toBe(FIVE);
    expect(marketTtlMs(ET('2026-11-27', 13, 10), FIVE)).toBe(FIVE); // early close
  });

  it('then keeps prices until the next open: overnight, weekends and holidays cost nothing', () => {
    expect(marketTtlMs(ET('2026-10-13', 16, 25), FIVE)).toBe(17 * HOUR + 5 * 60_000);
    expect(marketTtlMs(ET('2026-10-09', 17), FIVE)).toBe(ET('2026-10-12', 9, 30) - ET('2026-10-09', 17));
    expect(marketTtlMs(ET('2026-11-26', 10), FIVE)).toBe(ET('2026-11-27', 9, 30) - ET('2026-11-26', 10));
    expect(marketTtlMs(ET('2026-11-27', 13, 25), FIVE)).toBe(ET('2026-11-30', 9, 30) - ET('2026-11-27', 13, 25));
  });

  it("never holds a price past the open, and never for less than a minute", () => {
    expect(marketTtlMs(ET('2026-10-13', 9, 0), FIVE)).toBe(30 * 60_000);
    expect(marketTtlMs(ET('2026-10-13', 9, 29) + 45_000, FIVE)).toBe(60_000);
  });
});
