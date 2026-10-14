import 'server-only';

import { newYorkClock, newYorkMs } from '@/lib/market-data';
import { addDays } from '@/lib/market-calendar';
import { issueOf, PROVIDER_TIMEOUT_MS, ProviderError } from '@/lib/providers/gate';
import { gate, type ProviderName } from '@/lib/providers/registry';
import { parseFedCalendar, parseReleaseSchedule, upcomingEvents, type EventSource, type EventsResult, type MarketEvent } from '@/lib/events';

// The News page's upcoming events, from three free public schedules (no keys). Each is fetched at most every 6 hours
// through the shared request gate, kept in MongoDB so restarts and deploys don't fetch again, and an older copy
// (labeled with its age) stands in for up to a week if a site is down. Only the window the page shows is stored.

export const EVENT_FEEDS: { provider: ProviderName; source: EventSource; url: string; parse: (text: string) => MarketEvent[] }[] = [
  { provider: 'fed', source: 'Federal Reserve', url: 'https://www.federalreserve.gov/json/calendar.json', parse: parseFedCalendar },
  { provider: 'bls', source: 'BLS', url: 'https://www.bls.gov/schedule/news_release/bls.ics', parse: (text) => parseReleaseSchedule(text, 'BLS') },
  { provider: 'bea', source: 'BEA', url: 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', parse: (text) => parseReleaseSchedule(text, 'BEA') },
];

const EVENTS_CACHE = { ttlMs: 6 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000, persist: true, waitMs: 6000 } as const;
// Stored copies cover a little past the page's window, so a week-old copy still fills it
const STORE_AHEAD_DAYS = 45;
// Government sites turn away requests without a browser-like name
const USER_AGENT = 'Mozilla/5.0 (compatible; LoopsWatch/1.0; personal research app)';

const fetchFeed = async (feed: (typeof EVENT_FEEDS)[number]) =>
  gate(feed.provider).request<MarketEvent[]>(`${feed.provider}:schedule`, async () => {
    let res: Response;
    try {
      res = await fetch(feed.url, { cache: 'no-store', headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    } catch {
      throw new ProviderError(feed.provider, 'network');
    }
    if (!res.ok) throw new ProviderError(feed.provider, res.status === 429 ? 'rate-limit' : 'provider', res.status);
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new ProviderError(feed.provider, 'network', res.status);
    }
    const now = Date.now();
    const today = newYorkClock(now).day;
    const parsed = feed.parse(text);
    // An answer with nothing in it is a changed or broken file, not an empty schedule
    if (parsed.length === 0) throw new ProviderError(feed.provider, 'provider', res.status);
    const until = newYorkMs(addDays(today, STORE_AHEAD_DAYS), 0);
    const date = Date.parse(res.headers.get('date') ?? '');
    return { data: parsed.filter((event) => event.start >= newYorkMs(addDays(today, -1), 0) && event.start <= until), fetchedAt: Number.isFinite(date) ? date : undefined };
  }, EVENTS_CACHE);

// Today's and the next 30 days' events from all three schedules; a failing source leaves the others showing
export async function getUpcomingEvents(): Promise<EventsResult> {
  const results = await Promise.all(
    EVENT_FEEDS.map(async (feed) => {
      try {
        const served = await fetchFeed(feed);
        return { events: served.data, status: { source: feed.source, fetchedAt: served.fetchedAt, stale: served.stale } };
      } catch (e) {
        const issue = issueOf(e);
        if (issue !== 'busy') console.error('Error fetching the', feed.source, 'schedule', issue);
        return { events: [], status: { source: feed.source, stale: false, issue } };
      }
    })
  );
  const checkedAt = Date.now();
  return { events: upcomingEvents(results.flatMap((r) => r.events), checkedAt), sources: results.map((r) => r.status), checkedAt };
}
