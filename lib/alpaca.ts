import 'server-only';

import { HISTORY_START_DAY, joinBars, nextFinalAt, readDailyBars, type DailyBars } from '@/lib/daily-bars';
import { PROVIDER_TIMEOUT_MS, ProviderError } from '@/lib/providers/gate';
import { gate } from '@/lib/providers/registry';

// Daily price history from Alpaca's free market-data plan, for the Portfolio page's backtests (lib/daily-bars.ts
// says what the bars are). Server only: the keys must never reach the browser. They come from a free Alpaca account
// (paper trading is enough) and go in request headers, never in a URL, a cache key or an error.

export const ALPACA_DATA_URL = 'https://data.alpaca.markets/v2';

const getAlpacaKeys = () => {
  const id = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  return id && secret ? { id, secret } : undefined;
};

export const alpacaConfigured = () => !!getAlpacaKeys();

const alpacaError = (status?: number) =>
  new ProviderError('Alpaca', status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : status ? 'provider' : 'network', status);

// The free plan serves SIP data only up to 15 minutes ago; asking for later is refused
const SIP_DELAY_MS = 16 * 60_000;
// A symbol's history since 2016 is about 2,700 daily bars, one page; the cap only stops a runaway loop
const PAGE_LIMIT = 10_000;
const MAX_PAGES = 3;

export type DailyHistory = {
  bars: DailyBars;
  // Bars skipped for a missing or non-positive price
  skipped: number;
  fetchedAt: number;
  // A copy older than its fresh time, shown while a newer one loads
  stale: boolean;
};

async function fetchPage(symbol: string, end: string, pageToken: string | undefined): Promise<{ raw: unknown; next?: string }> {
  const keys = getAlpacaKeys()!;
  const params = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Day',
    start: `${HISTORY_START_DAY}T00:00:00Z`,
    end,
    adjustment: 'all',
    feed: 'sip',
    limit: String(PAGE_LIMIT),
    sort: 'asc',
  });
  if (pageToken) params.set('page_token', pageToken);
  let res: Response;
  try {
    res = await fetch(`${ALPACA_DATA_URL}/stocks/bars?${params}`, {
      headers: { 'APCA-API-KEY-ID': keys.id, 'APCA-API-SECRET-KEY': keys.secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw alpacaError();
  }
  // An unknown or badly formed symbol: no bars, not a failure of the provider
  if (res.status === 400 || res.status === 422) return { raw: { bars: {} } };
  if (!res.ok) throw alpacaError(res.status);
  try {
    const raw = await res.json();
    return { raw, next: (raw as { next_page_token?: string | null }).next_page_token ?? undefined };
  } catch {
    throw alpacaError(res.status);
  }
}

// One symbol's adjusted daily bars since 2016, through the shared Alpaca budget. Kept in memory and in MongoDB until
// a newer bar can exist (the next session's bar is final at 8:20 PM New York), so a portfolio's history costs one call
// per symbol a day however often it's backtested, and a restart or deploy doesn't fetch it again.
export async function getDailyHistory(symbol: string): Promise<DailyHistory> {
  if (!getAlpacaKeys()) throw new ProviderError('Alpaca', 'not-configured');
  const now = Date.now();
  const ttlMs = Math.max(nextFinalAt(now) - now, 10 * 60_000);
  const served = await gate('alpaca').request<{ bars: DailyBars; skipped: number }>(
    `alpaca:bars:1Day:all:${symbol}`,
    async () => {
      const at = Date.now();
      const end = new Date(at - SIP_DELAY_MS).toISOString();
      const pages: DailyBars[] = [];
      let skipped = 0;
      let token: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const { raw, next } = await fetchPage(symbol, end, token);
        const read = readDailyBars(raw, symbol, at);
        pages.push(read.bars);
        skipped += read.skipped;
        if (!next) break;
        token = next;
      }
      return { data: { bars: joinBars(pages), skipped } };
    },
    // A stale copy (up to a week old) is shown while a new one loads, labeled with the day it runs through
    { ttlMs, staleMs: 7 * 24 * 60 * 60_000, persist: true, waitMs: 20_000 }
  );
  return { ...served.data, fetchedAt: served.fetchedAt, stale: served.stale };
}
