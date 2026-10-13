// Checks your Alpaca keys and the free market data the interactive heatmap takes from Alpaca (1H, 4H, 1M,
// pre-market, after hours and today's volume), and prints a pass/fail report.
//
//   npm run check:alpaca
//
// It reads ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY from .env and never prints them: they go in request headers,
// and errors are reduced to the HTTP status. It makes about 10 requests, well under the free plan's 200 a minute.
//
// What it checks, the same way the app asks (lib/alpaca.ts):
//   keys:      Alpaca accepts them
//   SIP bars:  daily and minute bars from every exchange, for times at least 15 minutes ago (all the free plan allows)
//   all stocks: one request returns daily bars for every heatmap stock, across pages
//   extended:  minute bars in the last finished pre-market and after-hours sessions
//   IEX:       the latest trade per stock, in real time
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ quiet: true });

const BASE = 'https://data.alpaca.markets/v2';
const ID = process.env.ALPACA_API_KEY_ID;
const SECRET = process.env.ALPACA_API_SECRET_KEY;

if (!ID || !SECRET) {
  console.error('FAIL  ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY must both be set in .env');
  process.exit(1);
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const heatmapSource = read('lib/data/heatmap.ts');
const heatmapSymbols = [...heatmapSource.slice(heatmapSource.indexOf('HEATMAP_SYMBOLS')).matchAll(/"([A-Z.]+)"/g)].map((m) => m[1]);

let requests = 0;
async function get(path, params) {
  requests++;
  let res;
  try {
    res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { 'APCA-API-KEY-ID': ID, 'APCA-API-SECRET-KEY': SECRET } });
  } catch {
    return { error: 'network error' };
  }
  if (!res.ok) {
    const hint = res.status === 401 ? ' (keys rejected)' : res.status === 403 ? ' (keys rejected, or not allowed on the free plan)' : res.status === 429 ? ' (rate limit)' : '';
    return { error: `HTTP ${res.status}${hint}`, status: res.status };
  }
  try {
    return { data: await res.json() };
  } catch {
    return { error: 'answer was not JSON' };
  }
}

// Every page of a bars request, merged per symbol
async function bars(params) {
  const all = {};
  let pageToken;
  for (let page = 0; page < 10; page++) {
    const answer = await get('/stocks/bars', pageToken ? { ...params, page_token: pageToken } : params);
    if (answer.error) return answer;
    for (const [symbol, list] of Object.entries(answer.data.bars ?? {})) all[symbol] = [...(all[symbol] ?? []), ...list];
    pageToken = answer.data.next_page_token;
    if (!pageToken) break;
  }
  return { data: all };
}

const NY_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const nyDay = (ms) => {
  const p = Object.fromEntries(NY_PARTS.formatToParts(ms).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
};
// The instant of a New York wall-clock time (UTC−4 in summer, −5 in winter)
const nyInstant = (day, minutes) => {
  const [y, m, d] = day.split('-').map(Number);
  for (const offset of [4, 5]) {
    const instant = Date.UTC(y, m - 1, d, 0, minutes) + offset * 3_600_000;
    const back = nyDay(instant);
    if (back.day === day && back.minutes === minutes) return instant;
  }
  return Date.UTC(y, m - 1, d, 5, minutes);
};
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ny = (ms) => `${NY.format(ms)} ET`;
const iso = (ms) => new Date(ms).toISOString();

const results = [];
const note = (level, message) => {
  results.push(level);
  console.log(`${level.padEnd(5)} ${message}`);
};

const now = Date.now();
const sipEnd = now - 16 * 60_000;
console.log(`Checking Alpaca's free market data (${new Date(now).toISOString()}). The keys are never printed.\n`);

// 1. Keys, and SIP daily bars
const daily = await bars({ symbols: 'AAPL,MSFT', timeframe: '1Day', start: iso(now - 14 * 86_400_000), end: iso(sipEnd), adjustment: 'raw', feed: 'sip', limit: '1000' });
if (daily.error) {
  note('FAIL', `SIP daily bars: ${daily.error}`);
  console.log(`\n${requests} requests. RESULT: FAIL`);
  process.exit(1);
}
const aaplDays = daily.data.AAPL ?? [];
const lastBar = aaplDays.at(-1);
if (!lastBar) note('FAIL', 'SIP daily bars: none for AAPL in the last two weeks');
else {
  note('OK', `Keys accepted. SIP daily bars: ${aaplDays.length} for AAPL, the last on ${nyDay(Date.parse(lastBar.t)).day} (close ${lastBar.c}, volume ${lastBar.v.toLocaleString('en-US')})`);
  if (!(lastBar.vw > 0)) note('WARN', 'Daily bars have no volume-weighted price (vw): $ Volume will use shares × price instead');
}

// 2. Every heatmap stock in one request
const allDaily = await bars({ symbols: heatmapSymbols.join(','), timeframe: '1Day', start: iso(now - 7 * 86_400_000), end: iso(sipEnd), adjustment: 'raw', feed: 'sip', limit: '10000' });
if (allDaily.error) note('FAIL', `Daily bars for all ${heatmapSymbols.length} heatmap stocks: ${allDaily.error}`);
else {
  const missing = heatmapSymbols.filter((symbol) => !allDaily.data[symbol]?.length);
  note(missing.length ? 'WARN' : 'OK', `Daily bars for ${heatmapSymbols.length - missing.length} of ${heatmapSymbols.length} heatmap stocks${missing.length ? ` (none for ${missing.join(', ')})` : ''}`);
}

// 3. SIP minute bars in the last regular session, for 1H and 4H
// A daily bar's time is midnight New York time on its day
const lastDay = lastBar ? nyDay(Date.parse(lastBar.t)).day : nyDay(now).day;
const minuteEnd = Math.min(sipEnd, nyInstant(lastDay, 16 * 60));
const minutes = await bars({ symbols: 'AAPL', timeframe: '1Min', start: iso(minuteEnd - 60 * 60_000), end: iso(minuteEnd), adjustment: 'raw', feed: 'sip', limit: '10000' });
if (minutes.error) note('FAIL', `SIP minute bars: ${minutes.error}`);
else {
  const list = minutes.data.AAPL ?? [];
  note(list.length >= 30 ? 'OK' : 'WARN', `SIP minute bars: ${list.length} for AAPL in the hour to ${ny(minuteEnd)}${list.length ? `, the last at ${ny(Date.parse(list.at(-1).t))}` : ''}`);
}

// 4. Extended hours: the last finished sessions' minute bars
for (const [name, from, to] of [['Pre-market', 4 * 60, 9 * 60 + 30], ['After hours', 16 * 60, 20 * 60]]) {
  const start = nyInstant(lastDay, from);
  const end = Math.min(sipEnd, nyInstant(lastDay, to));
  if (end <= start) {
    note('INFO', `${name} ${lastDay}: not yet 15 minutes into the session, so SIP can't show it yet`);
    continue;
  }
  const answer = await bars({ symbols: 'AAPL,MSFT,NVDA', timeframe: '1Min', start: iso(start), end: iso(end), adjustment: 'raw', feed: 'sip', limit: '10000' });
  if (answer.error) {
    note('FAIL', `${name} minute bars: ${answer.error}`);
    continue;
  }
  const counts = ['AAPL', 'MSFT', 'NVDA'].map((symbol) => `${symbol} ${answer.data[symbol]?.length ?? 0}`);
  const any = ['AAPL', 'MSFT', 'NVDA'].some((symbol) => answer.data[symbol]?.length);
  note(any ? 'OK' : 'WARN', `${name} ${lastDay}: minute bars ${counts.join(', ')}`);
}

// 5. IEX latest trades, in real time
const latest = await get('/stocks/trades/latest', { symbols: 'AAPL,MSFT,NVDA', feed: 'iex' });
if (latest.error) note('FAIL', `IEX latest trades: ${latest.error}`);
else {
  const trades = Object.entries(latest.data.trades ?? {});
  if (!trades.length) note('FAIL', 'IEX latest trades: none returned');
  for (const [symbol, trade] of trades) {
    const time = Date.parse(trade.t);
    const session = nyDay(time).minutes;
    const when = session < 4 * 60 || session >= 20 * 60 ? 'overnight' : session < 9 * 60 + 30 ? 'pre-market' : session < 16 * 60 ? 'regular session' : 'after hours';
    note('OK', `IEX latest trade ${symbol}: ${trade.p} at ${ny(time)} (${when}, ${Math.round((now - time) / 60_000)} min ago)`);
  }
}

const failed = results.includes('FAIL');
console.log(`\n${requests} requests. RESULT: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
