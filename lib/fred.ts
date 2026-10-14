import 'server-only';

import type { FeedIssue } from '@/lib/market-data';
import { PROVIDER_TIMEOUT_MS, ProviderError, type RequestOptions, type Served } from '@/lib/providers/gate';
import { gate } from '@/lib/providers/registry';

// Talking to FRED, the St. Louis Fed's free economic data API. Server only: the key must never reach the browser.
// Every call goes through fredGet, which spends FRED's own budget in the shared request gate (lib/providers/registry.ts).

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

export const getFredKey = () => process.env.FRED_API_KEY?.trim() || undefined;

// Why a FRED request failed. The message never includes the URL, which carries the key.
export class FredError extends ProviderError {
  constructor(issue: FeedIssue, status?: number) {
    super('FRED', issue, status);
    this.name = 'FredError';
  }
}

// FRED answers a missing, malformed or unregistered key with 400 and a message naming api_key
const issueFor = (status: number, message: string): FeedIssue =>
  status === 401 || status === 403 || (status === 400 && /api_key/i.test(message)) ? 'auth' : status === 429 ? 'rate-limit' : 'provider';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// FRED's figures change once a day at most (rates) and mostly once a month, so answers are reused for hours and kept
// in MongoDB across restarts. A stale copy stands in for up to a week while FRED fails; the page says so.
export const FRED_CACHE = {
  observations: { ttlMs: 6 * HOUR, staleMs: 7 * DAY, persist: true },
  series: { ttlMs: 12 * HOUR, staleMs: 7 * DAY, persist: true, priority: 'background' },
  release: { ttlMs: 30 * DAY, staleMs: 30 * DAY, persist: true, priority: 'background' },
  releaseDates: { ttlMs: 12 * HOUR, staleMs: 7 * DAY, persist: true, priority: 'background' },
} satisfies Record<string, RequestOptions>;

// The cache key: the path and its parameters in a fixed order, never the key
const cacheKey = (path: string, params: Record<string, string>) =>
  `fred:${path}?${new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`;

// One FRED GET through the shared gate: cached, merged with the same request in flight, and paced within FRED's
// limit. `keyParams` names the parameters that identify the answer (the rest, like today's date, don't change it).
// Throws a FredError when there's nothing usable (not even a stale copy).
export async function fredGet<T>(
  path: string,
  params: Record<string, string>,
  options: RequestOptions,
  keyParams: Record<string, string> = params
): Promise<Served<T>> {
  const key = getFredKey();
  if (!key) throw new FredError('not-configured');

  return gate('fred').request<T>(cacheKey(path, keyParams), async () => {
    const url = `${FRED_BASE_URL}${path}?${new URLSearchParams({ ...params, file_type: 'json', api_key: key })}`;
    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    } catch {
      throw new FredError('network');
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new FredError(timedOut ? 'network' : res.ok ? 'provider' : issueFor(res.status, ''), res.status);
    }
    if (!res.ok) {
      const message = typeof (body as { error_message?: unknown })?.error_message === 'string' ? (body as { error_message: string }).error_message : '';
      throw new FredError(issueFor(res.status, message), res.status);
    }

    const date = Date.parse(res.headers.get('date') ?? '');
    return { data: body as T, fetchedAt: Number.isFinite(date) ? date : undefined };
  }, options);
}
