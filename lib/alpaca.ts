import 'server-only';

import {
  SIP_DELAY_MS,
  closeAt,
  extendedPlan,
  extendedReference,
  inWindow,
  intradayWindow,
  monthAgoWindow,
  newYorkInstant,
  readBars,
  readLatestTrades,
  type AlpacaBar,
  type ExtendedSession,
  type IntradayPeriod,
} from '@/lib/alpaca-data';
import { newYorkClock, newestQuoteTime, type AlpacaStatus, type HeatmapStock } from '@/lib/market-data';
import { PROVIDER_TIMEOUT_MS, ProviderError, providerError } from '@/lib/providers/gate';
import { gate } from '@/lib/providers/registry';

// Alpaca's market data, for what Finnhub's free plan lacks (see lib/alpaca-data.ts for what the free plan allows).
// Server only: the keys must never reach the browser. They come from a free Alpaca account (paper trading is enough).

export const ALPACA_DATA_URL = 'https://data.alpaca.markets/v2';

const getAlpacaKeys = () => {
  const id = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  return id && secret ? { id, secret } : undefined;
};

export const alpacaConfigured = () => !!getAlpacaKeys();

class AlpacaError extends ProviderError {
  constructor(status?: number) {
    super('Alpaca', status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : status ? 'provider' : 'network', status);
    this.name = 'AlpacaError';
  }
}

// A GET through the shared Alpaca gate (cached, merged, paced within the free plan's 200 calls a minute).
// The keys go in headers, never the URL or the cache key, and errors never include either.
async function alpacaGet(path: string, params: Record<string, string>, revalidateSeconds: number): Promise<unknown> {
  const keys = getAlpacaKeys();
  if (!keys) throw new AlpacaError();
  const query = new URLSearchParams(params);
  const key = `alpaca:${path}?${new URLSearchParams([...query].sort(([a], [b]) => a.localeCompare(b)))}`;
  const served = await gate('alpaca').request<unknown>(key, async () => {
    let res: Response;
    try {
      res = await fetch(`${ALPACA_DATA_URL}${path}?${query}`, {
        headers: { 'APCA-API-KEY-ID': keys.id, 'APCA-API-SECRET-KEY': keys.secret },
        cache: 'no-store',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new AlpacaError();
    }
    if (!res.ok) throw new AlpacaError(res.status);
    try {
      return { data: await res.json() };
    } catch {
      throw new AlpacaError(res.status);
    }
  }, { ttlMs: revalidateSeconds * 1000, staleMs: revalidateSeconds * 1000, waitMs: 5000 });
  return served.data;
}

// Bars for many symbols, following Alpaca's pages (up to 10,000 bars a page, across the symbols). The heatmap's requests
// fit in one or two pages; the cap only stops a runaway loop.
async function getBars(symbols: readonly string[], timeframe: string, range: { start: string; end?: string }, revalidateSeconds: number, feed = 'sip') {
  const all = new Map<string, AlpacaBar[]>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = { symbols: symbols.join(','), timeframe, start: range.start, limit: '10000', adjustment: 'raw', feed };
    if (range.end) params.end = range.end;
    if (pageToken) params.page_token = pageToken;
    const raw = await alpacaGet('/stocks/bars', params, revalidateSeconds);
    for (const [symbol, bars] of readBars(raw)) all.set(symbol, [...(all.get(symbol) ?? []), ...bars]);
    pageToken = (raw as { next_page_token?: string | null }).next_page_token ?? undefined;
    if (!pageToken) break;
  }
  return all;
}

const iso = (ms: number) => new Date(ms).toISOString();

export type AlpacaExtras = {
  status: AlpacaStatus;
  stocks: Map<string, Pick<HeatmapStock, 'periodStart' | 'todayVolume' | 'extended'>>;
};

// Everything the interactive heatmap takes from Alpaca, per stock, given the stocks with their Finnhub quotes.
// Each part is fetched on its own, so one failing leaves the others; the status says if any failed.
export async function getAlpacaExtras(stocks: readonly HeatmapStock[], now: number): Promise<AlpacaExtras> {
  const result: AlpacaExtras['stocks'] = new Map(stocks.map((stock) => [stock.symbol, {}]));
  if (!getAlpacaKeys()) return { status: 'not-configured', stocks: result };

  const symbols = stocks.map((stock) => stock.symbol);
  const newest = newestQuoteTime(stocks);
  if (newest === undefined) return { status: 'ok', stocks: result };
  const lastSessionDay = newYorkClock(newest).day;
  // The last moment SIP can be asked about, on a whole minute so the same requests repeat (and hit the cache)
  // for a minute instead of changing every millisecond
  const sipEnd = Math.floor((now - SIP_DELAY_MS) / 60_000) * 60_000;
  const failures: number[] = [];
  const failed = (error: unknown) => {
    const known = providerError(error);
    failures.push(known ? (known.issue === 'busy' ? -1 : known.status ?? 0) : 0);
    return undefined;
  };
  const set = (symbol: string, update: (entry: Pick<HeatmapStock, 'periodStart' | 'todayVolume' | 'extended'>) => void) => {
    const entry = result.get(symbol);
    if (entry) update(entry);
  };

  // 1H and 4H: the price an hour (or 4) before the map's newest price, from SIP minute bars. Cached for a minute;
  // the window moves on every minute.
  const reference = Math.min(newest, now);
  const intraday = async (period: IntradayPeriod) => {
    const window = intradayWindow(period, reference);
    const bars = await getBars(symbols, '1Min', { start: iso(window.start), end: iso(Math.min(window.end, sipEnd)) }, 60).catch(failed);
    for (const symbol of symbols) {
      // The bar for the minute before the moment closes at it
      const start = closeAt(bars?.get(symbol), window.end - 60_000);
      if (start) set(symbol, (entry) => (entry.periodStart = { ...entry.periodStart, [period]: start.price }));
    }
  };

  // 1M: the last daily close on or before the same date a month before the last session. Cached for 6 hours.
  const month = async () => {
    const { start, end } = monthAgoWindow(lastSessionDay);
    // Full timestamps: a bare date's time of day is left to Alpaca, and the target day's bar must be included
    const endOfTarget = newYorkInstant(end, 23 * 60 + 59);
    const bars = await getBars(symbols, '1Day', { start: iso(newYorkInstant(start, 0)), end: iso(endOfTarget) }, 6 * 60 * 60).catch(failed);
    for (const symbol of symbols) {
      const start = closeAt(bars?.get(symbol), endOfTarget);
      if (start) set(symbol, (entry) => (entry.periodStart = { ...entry.periodStart, '1m': start.price }));
    }
  };

  // Today's volume (the last trading day's), from SIP daily bars up to 15 minutes ago. Cached for a minute.
  const volume = async () => {
    const start = newYorkInstant(lastSessionDay, 0);
    const bars = await getBars(symbols, '1Day', { start: iso(start), end: iso(sipEnd) }, 60).catch(failed);
    for (const symbol of symbols) {
      const bar = bars?.get(symbol)?.find((b) => newYorkClock(Date.parse(b.t)).day === lastSessionDay);
      if (!bar || !(bar.v > 0)) continue;
      const through = Math.min(sipEnd, newYorkInstant(lastSessionDay, 20 * 60));
      set(symbol, (entry) => (entry.todayVolume = { shares: bar.v, dollars: bar.vw ? bar.v * bar.vw : undefined, day: lastSessionDay, through }));
    }
  };

  // Pre-market and after hours: live from IEX's latest trades while the session is on (backed by SIP minute bars up to
  // 15 minutes ago for stocks IEX hasn't traded), or the last SIP minute bar of the latest finished session
  const extended = async (session: ExtendedSession) => {
    const plan = extendedPlan(session, now, newest);
    if (!plan) return;
    const end = Math.min(plan.window.end, sipEnd);
    const [bars, latest] = await Promise.all([
      end > plan.window.start
        ? getBars(symbols, '1Min', { start: iso(Math.max(plan.window.start, end - 60 * 60_000)), end: iso(end) }, plan.mode === 'live' ? 60 : 30 * 60).catch(failed)
        : undefined,
      plan.mode === 'live'
        ? alpacaGet('/stocks/trades/latest', { symbols: symbols.join(','), feed: 'iex' }, 15).then(readLatestTrades).catch(failed)
        : undefined,
    ]);
    for (const stock of stocks) {
      const referencePrice = extendedReference(plan, stock.quote, now);
      if (!referencePrice) continue;
      const fromBars = closeAt(bars?.get(stock.symbol), plan.window.end);
      const trade = latest?.get(stock.symbol);
      const fromIex = trade && inWindow(trade.time, plan.window) ? trade : undefined;
      // The newer of the two; a bar's time is its minute's start, so its close is at most a minute later
      const price = fromIex && (!fromBars || fromIex.time >= fromBars.time + 60_000) ? fromIex : fromBars ? { price: fromBars.price, time: fromBars.time + 60_000 } : undefined;
      // While a session is on, a stock that hasn't traded in it yet still gets its reference, so a streamed trade can fill it in
      if (!price && plan.mode !== 'live') continue;
      set(stock.symbol, (entry) => {
        entry.extended = {
          ...entry.extended,
          [session]: { price: price?.price, time: price ? Math.min(price.time, now) : undefined, reference: referencePrice, live: plan.mode === 'live', day: plan.day },
        };
      });
    }
  };

  await Promise.all([intraday('1h'), intraday('4h'), month(), volume(), extended('pre-market'), extended('post-market')]);
  if (failures.length) console.error(`getAlpacaExtras: ${failures.length} Alpaca requests failed (${[...new Set(failures)].map((s) => (s === -1 ? 'busy' : s || 'network')).join(', ')})`);
  const status: AlpacaStatus = !failures.length ? 'ok' : failures.some((s) => s === 401 || s === 403) ? 'auth' : 'failed';
  return { status, stocks: result };
}
