import { describe, expect, it } from 'vitest';
import { priceStamp } from '@/lib/price-stamp';

// Tue Oct 13 2026 in New York (EDT, UTC−4)
const AT_1042 = Date.UTC(2026, 9, 13, 14, 42);
const FRIDAY_CLOSE = Date.UTC(2026, 9, 9, 20, 0);

describe('priceStamp', () => {
  it('names the source and time of a current price during the session, without calling it consolidated', () => {
    const stamp = priceStamp({ hasPrice: true, quoteTime: AT_1042 - 30_000, session: 'regular', now: AT_1042 });
    expect(stamp.tone).toBe('normal');
    expect(stamp.text).toBe('Finnhub · 10:41 AM ET');
    expect(stamp.detail).toMatch(/not a consolidated feed/);
  });

  it('flags a price more than 15 minutes old while the market is open as delayed', () => {
    const stamp = priceStamp({ hasPrice: true, quoteTime: AT_1042 - 20 * 60_000, session: 'regular', now: AT_1042 });
    expect(stamp).toMatchObject({ tone: 'warning', text: 'Delayed · 10:22 AM ET' });
  });

  it('labels the last session close outside market hours', () => {
    const stamp = priceStamp({ hasPrice: true, quoteTime: FRIDAY_CLOSE, session: 'closed', now: AT_1042 });
    expect(stamp).toMatchObject({ tone: 'normal', text: 'Close · Fri, Oct 9, 4:00 PM ET' });
    expect(stamp.detail).toMatch(/last session's closing price/);
  });

  it('marks a cached copy and says why', () => {
    const stamp = priceStamp({ hasPrice: true, quoteTime: AT_1042 - 5 * 60_000, cached: true, issue: 'rate-limit', session: 'regular', now: AT_1042 });
    expect(stamp).toMatchObject({ tone: 'warning', text: 'Cached · 10:37 AM ET' });
    expect(stamp.detail).toMatch(/rate limit/);
  });

  it('says there is no price, and why, instead of showing one', () => {
    expect(priceStamp({ hasPrice: false, issue: 'busy', session: 'regular', now: AT_1042 })).toMatchObject({ tone: 'warning', text: 'No price' });
    expect(priceStamp({ hasPrice: false, issue: 'busy', session: 'regular', now: AT_1042 }).detail).toMatch(/request budget/);
  });

  it('warns when a price has no time', () => {
    expect(priceStamp({ hasPrice: true, session: 'regular', now: AT_1042 })).toMatchObject({ tone: 'warning', text: 'Finnhub · time unknown' });
  });
});
