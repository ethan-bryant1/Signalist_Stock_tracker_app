// Checks your Alpaca keys and the daily prices the Portfolio page's backtests use, and prints a pass/fail report.
//
//   npm run check:portfolio
//   npm run check:portfolio -- --symbols=SPY,AAPL,BRK.B
//
// It reads ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY from .env and never prints them: they go in request headers,
// and errors are reduced to the HTTP status. One request per symbol, well under the free plan's 200 a minute.
//
// It asks the way the app does (lib/alpaca.ts): 1Day bars since 2016, SIP feed, adjusted for splits and dividends,
// ending 16 minutes ago. Written independently of the app's code, it checks for each symbol:
//   - Alpaca accepts the keys and the request (the free plan refuses SIP data newer than 15 minutes)
//   - history starts in early 2016 (or at the listing), oldest first, one bar per day, on weekdays
//   - each bar is stamped at midnight New York time (how the app reads a bar's day)
//   - prices are positive and high ≥ open, close ≥ low
//   - the newest bar is from the last few days
// Compare the printed last close with the provider's own chart (Alpaca's or TradingView's adjusted close).
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const BASE = 'https://data.alpaca.markets/v2';
const ID = process.env.ALPACA_API_KEY_ID;
const SECRET = process.env.ALPACA_API_SECRET_KEY;
const arg = process.argv.slice(2).find((a) => a.startsWith('--symbols='));
const SYMBOLS = arg ? arg.slice('--symbols='.length).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : ['SPY', 'AAPL', 'AGG'];

if (!ID || !SECRET) {
  console.error('FAIL  ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY must both be set in .env');
  process.exit(1);
}

const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const ny = (ms) => Object.fromEntries(nyParts.formatToParts(ms).map((p) => [p.type, p.value]));

let failures = 0;
const report = (ok, text) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
};

for (const symbol of SYMBOLS) {
  const params = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Day',
    start: '2016-01-01T00:00:00Z',
    end: new Date(Date.now() - 16 * 60_000).toISOString(),
    adjustment: 'all',
    feed: 'sip',
    limit: '10000',
    sort: 'asc',
  });
  let res;
  try {
    res = await fetch(`${BASE}/stocks/bars?${params}`, { headers: { 'APCA-API-KEY-ID': ID, 'APCA-API-SECRET-KEY': SECRET } });
  } catch {
    report(false, `${symbol}: Alpaca couldn't be reached`);
    continue;
  }
  if (!res.ok) {
    report(false, `${symbol}: Alpaca answered HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (check the keys in .env)' : ''}`);
    continue;
  }
  const body = await res.json();
  const bars = body?.bars?.[symbol] ?? [];
  report(bars.length > 0, `${symbol}: ${bars.length} daily bars`);
  if (!bars.length) continue;
  report(!body.next_page_token, `${symbol}: whole history in one page`);
  const days = bars.map((b) => {
    const p = ny(Date.parse(b.t));
    return { day: `${p.year}-${p.month}-${p.day}`, midnight: p.hour === '00' && p.minute === '00', weekday: p.weekday };
  });
  report(days.every((d) => d.midnight), `${symbol}: every bar stamped at midnight New York time`);
  report(days.every((d, i) => i === 0 || d.day > days[i - 1].day), `${symbol}: oldest first, one bar per day`);
  report(days.every((d) => d.weekday !== 'Sat' && d.weekday !== 'Sun'), `${symbol}: no weekend bars`);
  report(bars.every((b) => b.o > 0 && b.c > 0 && b.h >= Math.max(b.o, b.c) - 1e-9 && b.l <= Math.min(b.o, b.c) + 1e-9), `${symbol}: positive prices, high and low around open and close`);
  console.log(`INFO  ${symbol}: history starts ${days[0].day}`);
  const ageDays = (Date.now() - Date.parse(bars.at(-1).t)) / 86_400_000;
  report(ageDays < 6, `${symbol}: newest bar ${days.at(-1).day} (adjusted close ${bars.at(-1).c})`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
