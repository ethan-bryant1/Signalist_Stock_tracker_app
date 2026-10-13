import 'server-only';

import type { FeedIssue } from '@/lib/market-data';
import { PROVIDER_TIMEOUT_MS, ProviderError, type RequestOptions, type Served } from '@/lib/providers/gate';
import { gate } from '@/lib/providers/registry';

// Talking to Finnhub. Server only: the API key must never reach the browser.
// Every REST call goes through finnhubGet, which spends the shared Finnhub budget (lib/providers/registry.ts).

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
// Finnhub's live trade stream (see lib/finnhub-stream.ts)
export const FINNHUB_STREAM_URL = 'wss://ws.finnhub.io';

let warnedPublicName = false;

// The key. The tutorial named it NEXT_PUBLIC_FINNHUB_API_KEY, a prefix that tells Next it may go to the browser;
// it's still read here (only on the server) so older .env files keep working, with a warning to rename it.
export const getFinnhubToken = () => {
  if (process.env.FINNHUB_API_KEY) return process.env.FINNHUB_API_KEY;
  const legacy = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (legacy && !warnedPublicName) {
    warnedPublicName = true;
    console.warn('Rename NEXT_PUBLIC_FINNHUB_API_KEY to FINNHUB_API_KEY in .env: the NEXT_PUBLIC_ prefix lets Next send a value to browsers.');
  }
  return legacy || undefined;
};

// Why a Finnhub request failed. The message never includes the URL, which carries the API key.
export class FinnhubError extends ProviderError {
  constructor(issue: FeedIssue, status?: number) {
    super('Finnhub', issue, status);
    this.name = 'FinnhubError';
  }
}

const issueForStatus = (status: number): FeedIssue =>
  status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : 'provider';

// How long each kind of answer is reused, and how much longer a stale copy may stand in while it refreshes or
// while Finnhub fails. Slow answers are also kept in MongoDB so restarts and deploys don't fetch them again.
export const FINNHUB_CACHE = {
  quote: { ttlMs: 60_000, staleMs: 15 * 60_000 },
  marketStatus: { ttlMs: 60_000, staleMs: 10 * 60_000 },
  profile: { ttlMs: 24 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000, persist: true, priority: 'background' },
  metric: { ttlMs: 6 * 60 * 60_000, staleMs: 24 * 60 * 60_000, persist: true, priority: 'background' },
  search: { ttlMs: 30 * 60_000, staleMs: 24 * 60 * 60_000 },
  news: { ttlMs: 5 * 60_000, staleMs: 60 * 60_000 },
} satisfies Record<string, RequestOptions>;

// The cache key: the path and its parameters in a fixed order, never the key
const cacheKey = (path: string, params: Record<string, string>) =>
  `finnhub:${path}?${new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`;

// One Finnhub GET through the shared gate: cached, merged with the same request in flight, and paced within the
// free plan's budget. Throws a FinnhubError when there's nothing usable (not even a stale copy).
export async function finnhubGet<T>(path: string, params: Record<string, string>, options: RequestOptions): Promise<Served<T>> {
  const token = getFinnhubToken();
  if (!token) throw new FinnhubError('not-configured');

  return gate('finnhub').request<T>(cacheKey(path, params), async () => {
    const url = `${FINNHUB_BASE_URL}${path}?${new URLSearchParams({ ...params, token })}`;
    let res: Response;
    try {
      // The gate is the cache; Next's own data cache would key on the URL (with the key in it) and can be skipped
      // by browser no-cache headers in development
      res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    } catch {
      throw new FinnhubError('network');
    }
    if (!res.ok) throw new FinnhubError(issueForStatus(res.status), res.status);

    let data: T;
    try {
      data = (await res.json()) as T;
    } catch (error) {
      // A body cut off by the time limit is a connection problem, not a bad answer
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new FinnhubError(timedOut ? 'network' : 'provider', res.status);
    }
    // Finnhub sometimes answers 200 with {"error": "..."}, for example for a plan it doesn't cover
    if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as { error?: unknown }).error === 'string') {
      throw new FinnhubError('provider', res.status);
    }

    const date = Date.parse(res.headers.get('date') ?? '');
    return { data, fetchedAt: Number.isFinite(date) ? date : undefined };
  }, options);
}

// Just the answer, for callers that don't need its age
export const finnhubData = async <T>(path: string, params: Record<string, string>, options: RequestOptions): Promise<T> =>
  (await finnhubGet<T>(path, params, options)).data;

// Runs fn on every item with at most `limit` at a time, keeping the order. fn must not throw: one rejection rejects
// the whole call and the other results are lost, so callers catch inside fn (as getHeatmapData does).
export const mapWithLimit = async <T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

// Of several failures, the one most worth telling the user about
const ISSUE_ORDER: FeedIssue[] = ['not-configured', 'auth', 'rate-limit', 'busy', 'provider', 'network'];
export const worstIssue = (issues: Iterable<FeedIssue>): FeedIssue | undefined => {
  const seen = new Set(issues);
  return ISSUE_ORDER.find((issue) => seen.has(issue));
};

// One log line per batch, without URLs (they carry the key). "busy" isn't a failure: those requests are still queued
// under our own call budget (expected at the open, when every price is due at once) and fill the cache for the next
// refresh, so they're logged as information and only real failures as errors.
export const logIssues = (label: string, issues: FeedIssue[]) => {
  const failed = issues.filter((issue) => issue !== 'busy');
  const queued = issues.length - failed.length;
  if (failed.length) console.error(`${label}: ${failed.length} Finnhub requests failed (${[...new Set(failed)].join(', ')})`);
  if (queued) console.info(`${label}: ${queued} Finnhub requests still queued under the call budget; they fill the cache for the next refresh`);
};
