import 'server-only';

import type { FeedIssue } from '@/lib/market-data';

// Talking to Finnhub. Server only: the API key must never reach the browser.

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const getFinnhubToken = () => process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

// Why a Finnhub request failed. The message never includes the URL, which carries the API key.
export class FinnhubError extends Error {
  constructor(
    readonly issue: FeedIssue,
    readonly status?: number
  ) {
    super(`Finnhub request failed: ${issue}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'FinnhubError';
  }
}

const issueForStatus = (status: number): FeedIssue =>
  status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : 'provider';

// A cached GET to Finnhub. With a revalidate time, Next keeps the answer and serves it to everyone for that long,
// then refreshes it in the background on the next request (only successful answers are kept, so a failed refresh
// leaves the last good one in place). Without one, every call goes to Finnhub.
// Also returns when Finnhub sent the answer (its Date header), which is kept with the cached copy.
export async function fetchFinnhub<T>(url: string, revalidateSeconds?: number): Promise<{ data: T; fetchedAt?: number }> {
  const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    throw new FinnhubError('network');
  }
  if (!res.ok) throw new FinnhubError(issueForStatus(res.status), res.status);

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new FinnhubError('provider', res.status);
  }
  // Finnhub sometimes answers 200 with {"error": "..."}, for example for a plan it doesn't cover
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as { error?: unknown }).error === 'string') {
    throw new FinnhubError('provider', res.status);
  }

  const date = Date.parse(res.headers.get('date') ?? '');
  return { data, fetchedAt: Number.isFinite(date) ? date : undefined };
}

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  return (await fetchFinnhub<T>(url, revalidateSeconds)).data;
}

// Runs fn on every item with at most `limit` at a time, keeping the order
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
const ISSUE_ORDER: FeedIssue[] = ['not-configured', 'auth', 'rate-limit', 'provider', 'network'];
export const worstIssue = (issues: Iterable<FeedIssue>): FeedIssue | undefined => {
  const seen = new Set(issues);
  return ISSUE_ORDER.find((issue) => seen.has(issue));
};
