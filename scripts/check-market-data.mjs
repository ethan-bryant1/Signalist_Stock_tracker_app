// Checks the real Finnhub data behind the heatmaps with your own API key, and prints a pass/fail report.
//
//   npm run check:market-data                 every heatmap stock and sector ETF (about 4 minutes)
//   npm run check:market-data -- --quick      the first 10 stocks only
//   npm run check:market-data -- --symbols=AAPL,BRK.B
//
// It reads FINNHUB_API_KEY from .env and never prints it: request URLs aren't shown, and errors are reduced to
// the HTTP status. It stays under Finnhub's free-plan limit of 60 requests a minute.
//
// The checks are written independently of the app's own code (lib/market-data.ts), so a mistake in one shows up
// as a disagreement with the other. What it checks for each stock:
//   quote:   a positive price and previous close; Finnhub's own change (d, dp) matches price − previous close;
//            day high ≥ low; a timestamp that isn't in the future, and how old it is for the current session
//   profile: the profile is for this company (another share class's is fine, since the map only uses company-wide
//            figures); in US dollars; a positive market cap that roughly equals price × shares outstanding; a known
//            US exchange; an https logo
//   stats:   Finnhub's daily stats (/stock/metric) have the period returns and average volume the longer-period
//            and volume maps use, with believable values
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ quiet: true });

const BASE = 'https://finnhub.io/api/v1';
const TOKEN = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
const args = process.argv.slice(2);
const REQUEST_GAP_MS = 1100;

if (!TOKEN) {
  console.error('FAIL  FINNHUB_API_KEY is not set in .env');
  process.exit(1);
}

// The symbols, read from the app's own lists so this always checks what the app shows
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const heatmapSource = read('lib/data/heatmap.ts');
const heatmapSymbols = [...heatmapSource.slice(heatmapSource.indexOf('HEATMAP_SYMBOLS')).matchAll(/"([A-Z.]+)"/g)].map((m) => m[1]);
const sectorEtfs = [...read('lib/data/markets.ts').matchAll(/sector: "([^"]+)", short: "[^"]+", symbol: "([A-Z]+)"/g)].map((m) => ({ sector: m[1], symbol: m[2] }));
const sp500 = new Map([...read('lib/data/sp500.ts').matchAll(/symbol: "([^"]+)", name: "([^"]+)", sector: "([^"]+)"/g)].map((m) => [m[1], { name: m[2], sector: m[3] }]));

const only = args.find((a) => a.startsWith('--symbols='))?.split('=')[1]?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const stocks = only ?? (args.includes('--quick') ? heatmapSymbols.slice(0, 10) : heatmapSymbols);
const etfs = only || args.includes('--quick') ? [] : sectorEtfs.map((e) => e.symbol);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;
let requests = 0;

// One GET, paced, with the key kept out of anything printed
async function get(path) {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  requests++;
  const separator = path.includes('?') ? '&' : '?';
  let res;
  try {
    res = await fetch(`${BASE}${path}${separator}token=${encodeURIComponent(TOKEN)}`);
  } catch {
    return { error: 'network error' };
  }
  const date = Date.parse(res.headers.get('date') ?? '');
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (!res.ok) return { error: `HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (key rejected or endpoint not in plan)' : res.status === 429 ? ' (rate limit)' : ''}`, remaining };
  try {
    const data = await res.json();
    if (data && typeof data === 'object' && typeof data.error === 'string') return { error: 'provider error in a 200 answer', remaining };
    return { data, date: Number.isFinite(date) ? date : undefined, remaining };
  } catch {
    return { error: 'answer was not JSON', remaining };
  }
}

const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ny = (ms) => `${NY.format(ms)} ET`;
const results = [];
const note = (symbol, level, message) => results.push({ symbol, level, message });

console.log(`Checking ${stocks.length} heatmap stocks${etfs.length ? ` and ${etfs.length} sector ETFs` : ''} against Finnhub (${new Date().toISOString()})`);
console.log('This takes about a second per request. The API key is never printed.\n');

// The session from the New York clock (pre-market 4:00, open 9:30, close 16:00, after hours until 20:00, weekdays),
// used when Finnhub's market status can't load. It doesn't know holidays or early closes.
const NY_CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function sessionFromClock(ms) {
  const parts = Object.fromEntries(NY_CLOCK.formatToParts(ms).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return 'closed';
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'pre-market';
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'regular';
  if (minutes >= 16 * 60 && minutes < 20 * 60) return 'post-market';
  return 'closed';
}

// The market session, which decides how old a price may be
const status = await get('/stock/market-status?exchange=US');
let session;
if (status.error) {
  // Not "closed" by default: that would allow 4-day-old prices in the middle of a trading day
  session = sessionFromClock(Date.now());
  note('market-status', 'WARN', `market status unavailable (${status.error}); using the New York clock instead, which says "${session}" (holidays and early closes not known)`);
} else {
  session = status.data?.session ?? (status.data?.isOpen ? 'regular' : 'closed');
  console.log(`Market: ${status.data.isOpen ? 'open' : 'closed'}, session "${session ?? 'none'}"${status.data.holiday ? `, holiday: ${status.data.holiday}` : ''}`);
}

const now = Date.now();
let newest = 0;
const quoteTimes = new Map();

async function checkQuote(symbol) {
  const q = await get(`/quote?symbol=${encodeURIComponent(symbol)}`);
  if (q.error) return note(symbol, 'FAIL', `quote: ${q.error}`);
  const { c, d, dp, h, l, o, pc, t } = q.data;
  if (!(c > 0)) return note(symbol, 'FAIL', `quote: no price (c=${c}); Finnhub answers unknown symbols with zeros`);
  if (!(pc > 0)) note(symbol, 'FAIL', `quote: no previous close (pc=${pc}), so the 1-day change can't be worked out`);
  else {
    const change = c - pc;
    const percent = (change / pc) * 100;
    if (typeof d === 'number' && Math.abs(change - d) > 0.011) note(symbol, 'WARN', `quote: Finnhub's change ${d} differs from price − previous close ${change.toFixed(4)}`);
    if (typeof dp === 'number' && Math.abs(percent - dp) > 0.011) note(symbol, 'WARN', `quote: Finnhub's percent ${dp} differs from the computed ${percent.toFixed(4)}%`);
    if (Math.abs(percent) > 25) note(symbol, 'WARN', `quote: a ${percent.toFixed(2)}% move; check for a split or a bad previous close`);
  }
  if (h > 0 && l > 0 && h < l) note(symbol, 'FAIL', `quote: day high ${h} is below day low ${l}`);
  if (session === 'regular' && h > 0 && l > 0 && (c > h * 1.001 || c < l * 0.999)) note(symbol, 'WARN', `quote: price ${c} is outside the day range ${l}–${h}`);
  if (!(o > 0)) note(symbol, 'INFO', 'quote: no open price');
  if (!(t > 0)) note(symbol, 'WARN', 'quote: no timestamp, so the app shows the price as stale');
  else {
    const ms = t * 1000;
    if (ms > now + 5 * 60_000) note(symbol, 'FAIL', `quote: timestamp ${ny(ms)} is in the future`);
    quoteTimes.set(symbol, ms);
    newest = Math.max(newest, ms);
  }
  if (q.date && Math.abs(q.date - Date.now()) > 5 * 60_000) note(symbol, 'WARN', `Finnhub's clock (${new Date(q.date).toISOString()}) is more than 5 minutes off yours`);
  return { price: c };
}

async function checkProfile(symbol, price) {
  const p = await get(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
  if (p.error) return note(symbol, 'FAIL', `profile: ${p.error}`);
  const profile = p.data ?? {};
  if (!profile.ticker) return note(symbol, 'FAIL', 'profile: empty (no company profile for this symbol)');
  // BRK.B, BRK-B and BRK/B are one listing; BRK.A and BRK.B are two classes of one company
  const listing = (t) => t.trim().toUpperCase().replace(/[-/]/g, '.');
  const otherClass = listing(profile.ticker) !== listing(symbol);
  if (otherClass && listing(profile.ticker).split('.')[0] !== listing(symbol).split('.')[0]) {
    return note(symbol, 'FAIL', `profile: is for ${profile.ticker}, a different company; the app ignores it, so ${symbol} has no market cap, logo or exchange`);
  }
  // The map only takes company-wide figures from a profile (name, logo, exchange, total market cap), which are the
  // same for every share class; shares outstanding are counted in the other class, so they can't be cross-checked
  if (otherClass) note(symbol, 'INFO', `profile: Finnhub answers with ${profile.ticker}'s profile (same company, other share class). The map uses only its company-wide figures, so the market cap is the whole company's; shares outstanding can't be cross-checked`);
  if (profile.currency && profile.currency !== 'USD') note(symbol, 'WARN', `profile: figures in ${profile.currency}; the app leaves this market cap out`);
  if (!(profile.marketCapitalization > 0)) note(symbol, 'FAIL', 'profile: no market cap, so the market-cap map leaves this stock out (listed under the map)');
  else if (price && profile.shareOutstanding > 0 && !otherClass) {
    const implied = price * profile.shareOutstanding;
    const ratio = profile.marketCapitalization / implied;
    if (ratio < 0.8 || ratio > 1.25) note(symbol, 'WARN', `profile: market cap $${(profile.marketCapitalization / 1000).toFixed(1)}B is ${ratio.toFixed(2)}× price × shares ($${(implied / 1000).toFixed(1)}B)`);
  }
  const exchange = (profile.exchange ?? '').toUpperCase();
  if (!/NASDAQ|NEW YORK STOCK EXCHANGE|^NYSE|NYSE MKT|AMERICAN|ARCA|CBOE|BATS/.test(exchange)) note(symbol, 'WARN', `profile: unrecognized exchange "${profile.exchange ?? ''}"`);
  if (profile.logo && !/^https:\/\//.test(profile.logo)) note(symbol, 'INFO', 'profile: logo is not https, so the app skips it');
  if (!profile.logo) note(symbol, 'INFO', 'profile: no logo (the tile shows the ticker only)');
  const listed = sp500.get(symbol);
  if (listed && profile.name) note(symbol, 'INFO', `name "${profile.name}" (list: "${listed.name}", GICS ${listed.sector}; Finnhub industry "${profile.finnhubIndustry ?? ''}")`);
}

// The field each longer period uses (keep in step with lib/period-change.ts)
const RETURN_FIELDS = {
  '1W': '5DayPriceReturnDaily',
  MTD: 'monthToDatePriceReturnDaily',
  '3M': '13WeekPriceReturnDaily',
  '6M': '26WeekPriceReturnDaily',
  YTD: 'yearToDatePriceReturnDaily',
  '1Y': '52WeekPriceReturnDaily',
};
const statsMissing = new Map(Object.keys(RETURN_FIELDS).map((period) => [period, 0]));

async function checkStats(symbol, price) {
  const m = await get(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`);
  if (m.error) {
    for (const period of statsMissing.keys()) statsMissing.set(period, statsMissing.get(period) + 1);
    return note(symbol, 'FAIL', `stats: ${m.error}, so the longer periods and volume sizing have nothing for this stock`);
  }
  const metric = m.data?.metric ?? {};
  const missing = [];
  const starts = [];
  for (const [period, field] of Object.entries(RETURN_FIELDS)) {
    const value = metric[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missing.push(period);
      statsMissing.set(period, statsMissing.get(period) + 1);
      continue;
    }
    if (value <= -99 || value > 1000) note(symbol, 'WARN', `stats: ${period} return ${value}% looks wrong`);
    if (price) starts.push(`${period} ${value > 0 ? '+' : ''}${value.toFixed(2)}% (from $${(price / (1 + value / 100)).toFixed(2)})`);
  }
  if (missing.length) note(symbol, 'WARN', `stats: no ${missing.join(', ')} return, so those maps show "—" for this stock`);
  const volume = metric['10DayAverageTradingVolume'];
  if (!(volume > 0)) note(symbol, 'WARN', 'stats: no 10-day average volume, so the volume maps leave this stock out');
  if (starts.length) note(symbol, 'INFO', `stats: ${starts.join(', ')}; average volume ${volume > 0 ? `${volume.toFixed(2)}M shares` : 'none'}`);
}

for (const [index, symbol] of stocks.entries()) {
  process.stdout.write(`\r${index + 1}/${stocks.length} ${symbol.padEnd(6)}`);
  if (!sp500.has(symbol)) note(symbol, 'FAIL', 'not in lib/data/sp500.ts');
  const quote = await checkQuote(symbol);
  await checkProfile(symbol, quote?.price);
  await checkStats(symbol, quote?.price);
}
for (const [index, symbol] of etfs.entries()) {
  process.stdout.write(`\rETF ${index + 1}/${etfs.length} ${symbol.padEnd(6)}`);
  await checkQuote(symbol);
}
process.stdout.write('\r' + ' '.repeat(30) + '\r');

// Freshness, by the same rules the app uses (lib/market-data.ts): 15 minutes in the session, 30 minutes behind
// the newest price on the map, and at most 4 days when the market is closed
let stale = 0;
for (const [symbol, time] of quoteTimes) {
  const reasons = [];
  if (session === 'regular' && now - time > 15 * 60_000) reasons.push('older than 15 minutes during the session');
  if (newest - time > 30 * 60_000) reasons.push('more than 30 minutes behind the newest price');
  if (session !== 'regular' && now - time > 4 * 24 * 60 * 60_000) reasons.push('older than 4 days');
  if (reasons.length) {
    stale++;
    note(symbol, 'WARN', `price time ${ny(time)} would show as stale (${reasons.join('; ')})`);
  }
}

const count = (level) => results.filter((r) => r.level === level).length;
for (const level of ['FAIL', 'WARN', 'INFO']) {
  const rows = results.filter((r) => r.level === level);
  if (!rows.length || (level === 'INFO' && !args.includes('--verbose'))) continue;
  console.log(`\n${level}`);
  for (const r of rows) console.log(`  ${r.symbol.padEnd(14)} ${r.message}`);
}

console.log('\nSummary');
console.log(`  Requests sent:   ${requests}`);
console.log(`  Newest price:    ${newest ? ny(newest) : 'none'}`);
console.log(`  Stale prices:    ${stale} of ${quoteTimes.size}`);
console.log(`  Period stats:    ${[...statsMissing].map(([period, n]) => `${period} ${stocks.length - n}/${stocks.length}`).join(', ')}`);
console.log(`  Failures:        ${count('FAIL')}`);
console.log(`  Warnings:        ${count('WARN')}`);
console.log(`  Notes:           ${count('INFO')}${args.includes('--verbose') ? '' : ' (add --verbose to list them)'}`);
console.log(`\n${count('FAIL') ? 'RESULT: FAIL' : count('WARN') ? 'RESULT: PASS WITH WARNINGS' : 'RESULT: PASS'}`);
process.exit(count('FAIL') ? 1 : 0);
