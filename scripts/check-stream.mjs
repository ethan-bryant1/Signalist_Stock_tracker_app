// Checks Finnhub's live trade stream with your own API key: that it accepts a connection with 50 symbols (the
// most the app subscribes to) and, while the market is open, that trades arrive.
//
//   npm run check:stream            listens for 20 seconds
//   npm run check:stream -- --50    the default; --54 tries every heatmap stock, to see whether Finnhub allows more
//
// It reads FINNHUB_API_KEY from .env and never prints it. Close the app's Heatmap and Dashboard pages first:
// Finnhub may allow only one stream per key at a time.
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ quiet: true });

const TOKEN = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
const LISTEN_MS = 20_000;
if (!TOKEN) {
  console.error('FAIL  FINNHUB_API_KEY is not set in .env');
  process.exit(1);
}
if (typeof WebSocket === 'undefined') {
  console.error(`FAIL  Node.js ${process.version} has no built-in WebSocket. The live stream needs Node.js 22 or newer.`);
  process.exit(1);
}

const source = readFileSync(new URL('../lib/data/heatmap.ts', import.meta.url), 'utf8');
const symbols = [...source.slice(source.indexOf('HEATMAP_SYMBOLS')).matchAll(/"([A-Z.]+)"/g)].map((m) => m[1]);
const count = process.argv.includes('--54') ? symbols.length : 50;
const subscribed = symbols.slice(0, count);

const trades = new Map();
const errors = [];
let opened = false;
let closed;

const socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(TOKEN)}`);
socket.onopen = () => {
  opened = true;
  for (const symbol of subscribed) socket.send(JSON.stringify({ type: 'subscribe', symbol }));
  console.log(`Connected. Subscribed to ${subscribed.length} symbols; listening for ${LISTEN_MS / 1000} seconds…`);
};
socket.onmessage = (event) => {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.type === 'error') errors.push(message.msg ?? 'error');
  if (message.type === 'trade') for (const trade of message.data ?? []) trades.set(trade.s, (trades.get(trade.s) ?? 0) + 1);
};
socket.onclose = (event) => {
  if (opened) closed = `yes, by Finnhub (code ${event.code}${event.reason ? `, ${event.reason}` : ''})`;
};

await new Promise((resolve) => setTimeout(resolve, LISTEN_MS));
if (socket.readyState === WebSocket.OPEN) socket.close();

console.log('');
console.log(`  Connected:        ${opened ? 'yes' : 'no'}`);
console.log(`  Finnhub errors:   ${errors.length ? errors.join('; ') : 'none'}`);
console.log(`  Closed early:     ${closed ?? 'no'}`);
console.log(`  Trades received:  ${[...trades.values()].reduce((a, b) => a + b, 0)} for ${trades.size} of ${subscribed.length} symbols`);
if (!trades.size) console.log('                    (none is normal outside 9:30 AM to 4:00 PM ET on trading days)');

const ok = opened && !errors.length && !closed;
console.log(`\n${ok ? 'RESULT: PASS' : 'RESULT: FAIL'}`);
process.exit(ok ? 0 : 1);
