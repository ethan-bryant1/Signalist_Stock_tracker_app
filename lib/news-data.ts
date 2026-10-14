import 'server-only';

import { finnhubGet, mapWithLimit } from '@/lib/finnhub';
import { addDays } from '@/lib/market-calendar';
import { newYorkClock, type FeedIssue } from '@/lib/market-data';
import { issueOf } from '@/lib/providers/gate';
import { SP500_COMPANIES } from '@/lib/data/sp500';
import {
  mergeNews,
  normalizeArticle,
  normalizeEarnings,
  selectEarnings,
  type CompanyNewsResult,
  type EarningsEvent,
  type NewsFeed,
  type NewsItem,
  type ProviderArticle,
  type ProviderEarnings,
} from '@/lib/news';

// The News page's data, all from Finnhub's free plan through the shared cache and call budget (lib/finnhub.ts):
// - market news (/news, general and merger): 2 requests, reused for 10 minutes by every page and widget;
// - company news (/company-news): 1 request per symbol, reused for 30 minutes by the watchlist tab, the stock page
//   and the workspace's company-news widget alike (same range and cache, so opening one after another costs nothing);
// - the earnings calendar (/calendar/earnings): 1 request, reused for 6 hours.
// Copies are also kept in MongoDB, so a restart or deploy doesn't fetch them again, and a failing Finnhub leaves the
// last copy showing (labeled with its age) instead of an empty page. Finnhub's economic calendar is a paid
// endpoint, so the page keeps TradingView's free calendar widget for that.

const PAGE_WAIT_MS = 6000;

export const NEWS_CACHE = {
  market: { ttlMs: 10 * 60_000, staleMs: 24 * 60 * 60_000, persist: true },
  company: { ttlMs: 30 * 60_000, staleMs: 24 * 60 * 60_000, persist: true },
  earnings: { ttlMs: 6 * 60 * 60_000, staleMs: 3 * 24 * 60 * 60_000, persist: true },
} as const;

// Symbols per watchlist-news request: the page asks for a long list in several requests, one after another, so
// the first headlines appear quickly and the free plan's per-minute budget is never spent in one burst
export const WATCHLIST_NEWS_CHUNK = 12;
// Company news covers the past week (New York days); every page asks for the same range so they share one copy
const COMPANY_NEWS_DAYS = 7;
// The newest few articles per company in the watchlist tab, so one busy name doesn't crowd out the rest
const PER_COMPANY = 15;
// On a stock page or widget
const PER_STOCK_PAGE = 20;

// One company's news for the past week, newest first, from the shared cache
const fetchCompanyNews = async (symbol: string, now: number) => {
  const today = newYorkClock(now).day;
  const served = await finnhubGet<ProviderArticle[]>('/company-news', { symbol, from: addDays(today, -COMPANY_NEWS_DAYS), to: today }, { ...NEWS_CACHE.company, waitMs: PAGE_WAIT_MS });
  const items = (Array.isArray(served.data) ? served.data : [])
    .map((raw) => normalizeArticle(raw, 'company', now, symbol))
    .filter((item): item is NewsItem => item !== null);
  return { items: mergeNews([items]).sort((a, b) => b.datetime - a.datetime), fetchedAt: served.fetchedAt, stale: served.stale };
};

// The past week's news about one company, for its stock page and the workspace's company-news widget
export async function getCompanyNewsItems(symbol: string): Promise<CompanyNewsResult> {
  try {
    const news = await fetchCompanyNews(symbol, Date.now());
    return { ...news, items: news.items.slice(0, PER_STOCK_PAGE) };
  } catch (e) {
    const issue = issueOf(e);
    if (issue !== 'busy') console.error('Error fetching company news for', symbol, issue);
    return { items: [], stale: false, issue };
  }
}

export type NewsResult = {
  items: NewsItem[];
  // When Finnhub sent the oldest of the copies shown; undefined when nothing loaded
  fetchedAt?: number;
  // Some of what's shown is an older copy kept because a fresh one couldn't be fetched
  stale: boolean;
  issue?: FeedIssue;
  // The server's time when this answer was made
  checkedAt: number;
};

const MARKET_FEEDS: { category: string; feed: NewsFeed }[] = [
  { category: 'general', feed: 'markets' },
  { category: 'merger', feed: 'deals' },
];

// Finnhub's market headlines and its mergers and acquisitions headlines, as one list without repeats
export async function getMarketNews(): Promise<NewsResult> {
  const now = Date.now();
  const issues: FeedIssue[] = [];
  let stale = false;
  let fetchedAt: number | undefined;
  const lists = await Promise.all(
    MARKET_FEEDS.map(async ({ category, feed }) => {
      try {
        const served = await finnhubGet<ProviderArticle[]>('/news', { category }, { ...NEWS_CACHE.market, waitMs: PAGE_WAIT_MS });
        stale ||= served.stale;
        fetchedAt = fetchedAt === undefined ? served.fetchedAt : Math.min(fetchedAt, served.fetchedAt);
        return (Array.isArray(served.data) ? served.data : []).map((raw) => normalizeArticle(raw, feed, now)).filter((item): item is NewsItem => item !== null);
      } catch (e) {
        const issue = issueOf(e);
        issues.push(issue);
        if (issue !== 'busy') console.error('Error fetching market news', category, issue);
        return [];
      }
    })
  );
  return { items: mergeNews(lists), fetchedAt, stale, issue: issues[0], checkedAt: Date.now() };
}

export type SymbolNewsStatus = 'ok' | 'waiting' | 'failed';

export type WatchlistNewsResult = {
  items: NewsItem[];
  // Per symbol: loaded, still waiting for the call budget (ask again), or failed
  status: Record<string, SymbolNewsStatus>;
  fetchedAt?: number;
  stale: boolean;
  issue?: FeedIssue;
};

// The last few days' news for each symbol (at most WATCHLIST_NEWS_CHUNK per call), as one list without repeats
export async function getWatchlistNews(symbols: readonly string[]): Promise<WatchlistNewsResult> {
  const now = Date.now();
  const status: Record<string, SymbolNewsStatus> = {};
  const issues: FeedIssue[] = [];
  let stale = false;
  let fetchedAt: number | undefined;

  const lists = await mapWithLimit(symbols.slice(0, WATCHLIST_NEWS_CHUNK), 4, async (symbol) => {
    try {
      const news = await fetchCompanyNews(symbol, now);
      stale ||= news.stale;
      fetchedAt = fetchedAt === undefined ? news.fetchedAt : Math.min(fetchedAt, news.fetchedAt ?? fetchedAt);
      status[symbol] = 'ok';
      return news.items.slice(0, PER_COMPANY);
    } catch (e) {
      const issue = issueOf(e);
      status[symbol] = issue === 'busy' ? 'waiting' : 'failed';
      issues.push(issue);
      if (issue !== 'busy') console.error('Error fetching company news for', symbol, issue);
      return [];
    }
  });
  return { items: mergeNews(lists), status, fetchedAt, stale, issue: issues.find((issue) => issue !== 'busy') ?? issues[0] };
}

export type EarningsResult = {
  events: EarningsEvent[];
  // Company names for the S&P 500 members among the events (the only names we have without more requests)
  names: Record<string, string>;
  // The calendar's days, New York dates
  from: string;
  to: string;
  fetchedAt?: number;
  stale: boolean;
  issue?: FeedIssue;
};

const SP500_SYMBOLS = SP500_COMPANIES.map((company) => company.symbol);
const SP500_NAMES = new Map(SP500_COMPANIES.map((company) => [company.symbol, company.name]));
// Past days are kept so recent results (with their actual figures) stay visible
const EARNINGS_PAST_DAYS = 3;
const EARNINGS_AHEAD_DAYS = 14;

// Earnings reports from a few days ago to two weeks ahead for the S&P 500 and the given symbols. Finnhub's free plan
// covers US companies about a month around today.
export async function getEarnings(extraSymbols: readonly string[]): Promise<EarningsResult> {
  const today = newYorkClock(Date.now()).day;
  const from = addDays(today, -EARNINGS_PAST_DAYS);
  const to = addDays(today, EARNINGS_AHEAD_DAYS);
  try {
    const served = await finnhubGet<{ earningsCalendar?: ProviderEarnings[] }>('/calendar/earnings', { from, to }, { ...NEWS_CACHE.earnings, waitMs: PAGE_WAIT_MS });
    const rows = Array.isArray(served.data?.earningsCalendar) ? served.data.earningsCalendar : [];
    const events = selectEarnings(
      rows.map(normalizeEarnings).filter((event): event is EarningsEvent => event !== null),
      new Set([...SP500_SYMBOLS, ...extraSymbols])
    );
    const names = Object.fromEntries(events.flatMap((event) => (SP500_NAMES.has(event.symbol) ? [[event.symbol, SP500_NAMES.get(event.symbol)!]] : [])));
    return { events, names, from, to, fetchedAt: served.fetchedAt, stale: served.stale };
  } catch (e) {
    const issue = issueOf(e);
    if (issue !== 'busy') console.error('Error fetching the earnings calendar', issue);
    return { events: [], names: {}, from, to, stale: false, issue };
  }
}
