import 'server-only';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { INDEX_ETFS, MACRO_ETFS, SECTOR_ETFS } from '@/lib/data/markets';
import { FINNHUB_CACHE, finnhubData, finnhubGet, mapWithLimit, worstIssue } from '@/lib/finnhub';
import { marketTtlMs, normalizeQuote, sameListing, sessionFromClock, type FeedIssue, type MarketSession } from '@/lib/market-data';
import { issueOf } from '@/lib/providers/gate';

// Stock and market figures for server components, routes and jobs. Server only, and not server actions: pages
// call these after checking the session, so nobody outside can spend the Finnhub budget through them.
// Every call goes through the Finnhub gate (lib/finnhub.ts), which caches and paces them.

// How long a page waits for Finnhub's budget before showing what it has; the request still completes in the
// background and fills the cache
const PAGE_WAIT_MS = 6000;
// Outside the regular session a quote doesn't move, so it's reused for 15 minutes (never past the next open)
const CLOSED_QUOTE_MS = 15 * 60_000;
// The header strip and sector list are an overview, so their prices refresh every 5 minutes in the session
const OVERVIEW_QUOTE_MS = 5 * 60_000;

// ---------- News ----------

// The daily email needs 6 articles; a dozen symbols is plenty to pick them from without one request per symbol
const NEWS_SYMBOLS = 12;

// Up to 6 recent articles across the given symbols (round-robin), or general market news without symbols
export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  const range = getDateRange(5);
  const maxArticles = 6;
  const cleanSymbols = [...new Set((symbols || []).map((s) => s?.trim().toUpperCase()).filter((s): s is string => Boolean(s)))].slice(0, NEWS_SYMBOLS);

  if (cleanSymbols.length > 0) {
    // A few at a time, in the background lane, so the job never crowds out someone using the app
    const lists = await mapWithLimit(cleanSymbols, 3, (sym) =>
      finnhubData<RawNewsArticle[]>('/company-news', { symbol: sym, from: range.from, to: range.to }, { ...FINNHUB_CACHE.news, priority: 'background' })
        .then((articles) => (articles || []).filter(validateArticle))
        .catch((e) => {
          console.error('Error fetching company news for', sym, e);
          return [] as RawNewsArticle[];
        })
    );

    const collected: MarketNewsArticle[] = [];
    // Round-robin up to 6 picks
    for (let round = 0; round < maxArticles && collected.length < maxArticles; round++) {
      for (let i = 0; i < cleanSymbols.length && collected.length < maxArticles; i++) {
        const article = lists[i].shift();
        if (article) collected.push(formatArticle(article, true, cleanSymbols[i], round));
      }
    }
    if (collected.length > 0) return collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0)).slice(0, maxArticles);
    // If none collected, fall through to general news
  }

  const general = await finnhubData<RawNewsArticle[]>('/news', { category: 'general' }, { ...FINNHUB_CACHE.news, priority: 'background' });
  const seen = new Set<string>();
  const unique: RawNewsArticle[] = [];
  for (const art of general || []) {
    if (!validateArticle(art)) continue;
    const key = `${art.id}-${art.url}-${art.headline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(art);
    if (unique.length >= maxArticles) break;
  }
  return unique.map((a, idx) => formatArticle(a, false, undefined, idx));
}

// Recent news about one company from the past week, newest first, without repeated headlines.
// Returns null when the news can't be loaded, so the page can say so instead of "no news".
export async function getCompanyNews(symbol: string, limit = 20): Promise<MarketNewsArticle[] | null> {
  const sym = symbol.toUpperCase();
  const range = getDateRange(7);

  try {
    const articles = await finnhubData<RawNewsArticle[]>('/company-news', { symbol: sym, from: range.from, to: range.to }, { ...FINNHUB_CACHE.news, waitMs: PAGE_WAIT_MS });
    const seen = new Set<string>();
    return (Array.isArray(articles) ? articles : [])
      // Only keep complete articles whose link is a normal web address
      .filter((a) => a.headline?.trim() && a.datetime && a.url && /^https?:\/\//i.test(a.url))
      .filter((a) => {
        const key = a.headline!.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.datetime! - a.datetime!)
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        headline: a.headline!.trim(),
        summary: a.summary?.trim() ?? '',
        source: a.source || 'Company News',
        url: a.url!,
        datetime: a.datetime!,
        category: 'company',
        related: sym,
        image: a.image || '',
      }));
  } catch (e) {
    console.error('Error fetching company news for', sym, e);
    return null;
  }
}

// ---------- One stock ----------

// Turns Finnhub's exchange name (like "NASDAQ NMS - GLOBAL MARKET") into TradingView's prefix
export const toTradingViewExchange = (exchange?: string) => {
  const name = exchange?.toUpperCase() ?? '';
  if (name.includes('NASDAQ')) return 'NASDAQ';
  if (name.includes('NYSE MKT') || name.includes('AMERICAN') || name.includes('ARCA')) return 'AMEX';
  if (name.includes('NEW YORK STOCK EXCHANGE') || name === 'NYSE') return 'NYSE';
  if (name.includes('CBOE') || name.includes('BATS')) return 'CBOE';
  return undefined;
};

type FinnhubFullQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
type FinnhubFullProfile = {
  name?: string;
  logo?: string;
  exchange?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
  currency?: string;
  weburl?: string;
};
type FinnhubAllMetrics = { symbol?: string; metric?: Record<string, unknown> };

// Where a price came from and how old it is, for the label next to it
export type PriceStamp = {
  // Finnhub's time for the price (its last trade, or 4:00 PM ET after the close), in milliseconds
  quoteTime?: number;
  // When we received it from Finnhub (its Date header), in milliseconds
  receivedAt?: number;
  // Shown from our cache while a fresh copy couldn't be fetched
  cached?: boolean;
  // Why the price is missing or old
  issue?: FeedIssue;
  // When the server looked, in milliseconds
  checkedAt?: number;
};

export type StockOverview = PriceStamp & {
  symbol: string;
  // Ticker with its exchange (NASDAQ:AAPL), which TradingView's profile and financials widgets need
  tradingViewSymbol: string;
  name?: string;
  logo?: string;
  exchange?: string;
  industry?: string;
  currency: string;
  website?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  open?: number;
  previousClose?: number;
  dayHigh?: number;
  dayLow?: number;
  marketCap?: number; // in millions, as Finnhub returns it
  peRatio?: number;
  eps?: number;
  dividendYield?: number; // percent
  beta?: number;
  week52High?: number;
  week52Low?: number;
};

// A stock's price today with its name, logo and exchange: what the search window previews
export type StockQuote = Omit<StockOverview, 'peRatio' | 'eps' | 'dividendYield' | 'beta' | 'week52High' | 'week52Low'>;

// Finnhub sometimes sends 0 or nothing for figures it doesn't have
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const nonZero = (value: unknown) => num(value) || undefined;

// Tickers are letters and digits, sometimes with a dot or dash (BRK.B)
export const isValidSymbol = (symbol: string) => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol);

// The quote (reused for a minute) and the profile (a day), shared by every page that asks
export const getStockQuoteData = async (sym: string): Promise<StockQuote> => {
  const params = { symbol: sym };
  let issue: FeedIssue | undefined;
  const [quote, profile] = await Promise.all([
    finnhubGet<FinnhubFullQuote>('/quote', params, { ...FINNHUB_CACHE.quote, ttlMs: marketTtlMs(Date.now(), 60_000, CLOSED_QUOTE_MS), waitMs: PAGE_WAIT_MS }).catch((e) => {
      issue = issueOf(e);
      console.error('Error fetching quote for', sym, issue);
      return null;
    }),
    finnhubGet<FinnhubFullProfile>('/stock/profile2', params, { ...FINNHUB_CACHE.profile, priority: 'interactive', waitMs: PAGE_WAIT_MS }).catch((e) => {
      console.error('Error fetching profile2 for', sym, issueOf(e));
      return null;
    }),
  ]);

  // Finnhub returns a price of 0 for symbols it has no quote for, which normalizeQuote drops
  const latest = normalizeQuote(quote?.data);
  const p = profile?.data;
  const prefix = toTradingViewExchange(p?.exchange);

  return {
    symbol: sym,
    tradingViewSymbol: prefix ? `${prefix}:${sym}` : sym,
    name: p?.name || undefined,
    logo: p?.logo || undefined,
    exchange: prefix ?? (p?.exchange || undefined),
    industry: p?.finnhubIndustry || undefined,
    // Finnhub's free plan only prices US listings, which trade in dollars. Its profile currency is the currency the
    // company reports in (TWD for Taiwan Semiconductor's ADR), so it isn't used for prices, and a market cap
    // in another currency is left out rather than shown as dollars.
    currency: 'USD',
    website: p?.weburl && /^https?:\/\//i.test(p.weburl) ? p.weburl : undefined,
    price: latest?.price,
    change: latest?.change,
    changePercent: latest?.changePercent,
    open: latest?.open,
    previousClose: latest?.previousClose ?? nonZero(quote?.data?.pc),
    dayHigh: latest?.dayHigh,
    dayLow: latest?.dayLow,
    marketCap: !p?.currency || p.currency === 'USD' ? nonZero(p?.marketCapitalization) : undefined,
    quoteTime: latest?.time,
    receivedAt: latest ? quote?.fetchedAt : undefined,
    cached: latest ? quote?.stale : undefined,
    issue,
    checkedAt: Date.now(),
  };
};

// Everything the top of a stock's page shows: name, logo, price and key figures.
// Pieces that fail to load are left out, so the page still renders.
export async function getStockOverview(symbol: string): Promise<StockOverview> {
  const sym = symbol.toUpperCase();
  const [quote, metrics] = await Promise.all([
    getStockQuoteData(sym),
    finnhubData<FinnhubAllMetrics>('/stock/metric', { symbol: sym, metric: 'all' }, { ...FINNHUB_CACHE.metric, priority: 'interactive', waitMs: PAGE_WAIT_MS }).catch((e) => {
      console.error('Error fetching metrics for', sym, issueOf(e));
      return null;
    }),
  ]);

  const m = metrics?.metric ?? {};
  // Finnhub can answer a share-class ticker with another class's figures (BRK.A's for BRK.B, about 1,500 times
  // larger per share). Per-share figures from a different listing are left out; ratios are the same for both.
  const ownListing = !metrics?.symbol || sameListing(metrics.symbol, sym);

  return {
    ...quote,
    marketCap: quote.marketCap ?? (ownListing ? nonZero(m.marketCapitalization) : undefined),
    peRatio: num(m.peTTM) ?? num(m.peBasicExclExtraTTM),
    eps: ownListing ? num(m.epsTTM) ?? num(m.epsBasicExclExtraItemsTTM) : undefined,
    dividendYield: num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM),
    beta: num(m.beta),
    week52High: ownListing ? nonZero(m['52WeekHigh']) : undefined,
    week52Low: ownListing ? nonZero(m['52WeekLow']) : undefined,
  };
}

// ---------- The market strip ----------

export type MarketQuote = {
  price?: number;
  change?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  // Time of this price, in milliseconds (Finnhub's t)
  time?: number;
};

// Live figures for the dashboard and heatmap: whether the market is open, and prices for the index and sector funds
export type MarketSnapshot = {
  session: MarketSession;
  holiday?: string;
  quotes: Record<string, MarketQuote>;
  // Time of the latest price, in milliseconds
  asOf?: number;
  // When the server put this together, and why some prices are missing or old
  checkedAt: number;
  issue?: FeedIssue;
  // Prices served from our cache because a fresh copy couldn't be fetched
  cachedCount?: number;
};

type FinnhubMarketStatus = { isOpen?: boolean; session?: string | null; holiday?: string | null };

export const snapshotSymbols = (includeSectors: boolean) => [
  ...INDEX_ETFS.map(({ symbol }) => symbol),
  ...MACRO_ETFS.map(({ symbol }) => symbol),
  ...(includeSectors ? SECTOR_ETFS.map(({ symbol }) => symbol) : []),
];

// Index, gold, oil and bond fund prices, plus the sector funds when the page shows sector performance
export async function getMarketSnapshot(includeSectors = false): Promise<MarketSnapshot> {
  const symbols = snapshotSymbols(includeSectors);
  const issues: FeedIssue[] = [];
  const failed = (e: unknown) => {
    issues.push(issueOf(e));
    return null;
  };

  const [status, quotes] = await Promise.all([
    finnhubData<FinnhubMarketStatus>('/stock/market-status', { exchange: 'US' }, { ...FINNHUB_CACHE.marketStatus, ttlMs: 5 * 60_000, waitMs: 3000 }).catch(failed),
    Promise.all(symbols.map((symbol) =>
      finnhubGet<FinnhubFullQuote>('/quote', { symbol }, { ...FINNHUB_CACHE.quote, ttlMs: marketTtlMs(Date.now(), OVERVIEW_QUOTE_MS, CLOSED_QUOTE_MS), waitMs: 3000 }).catch(failed)
    )),
  ]);

  const checkedAt = Date.now();
  const snapshot: MarketSnapshot = { session: sessionFromClock(checkedAt), quotes: {}, checkedAt };
  if (status) {
    const session = status.session;
    snapshot.session = session === 'pre-market' || session === 'regular' || session === 'post-market'
      ? session
      : status.isOpen ? 'regular' : 'closed';
    snapshot.holiday = status.holiday || undefined;
  }

  let cachedCount = 0;
  symbols.forEach((symbol, i) => {
    // Finnhub returns a price of 0 for symbols it has no quote for, which normalizeQuote drops
    const quote = normalizeQuote(quotes[i]?.data);
    if (!quote) return;
    if (quotes[i]?.stale) cachedCount++;
    snapshot.quotes[symbol] = {
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      time: quote.time,
    };
    if (quote.time && quote.time > (snapshot.asOf ?? 0)) snapshot.asOf = quote.time;
  });

  snapshot.issue = worstIssue(issues);
  if (cachedCount) snapshot.cachedCount = cachedCount;
  if (issues.length) console.error(`getMarketSnapshot: ${issues.length} Finnhub requests failed (${[...new Set(issues)].join(', ')})`);
  return snapshot;
}
