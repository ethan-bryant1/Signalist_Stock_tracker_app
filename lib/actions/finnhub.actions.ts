'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { INDEX_ETFS, MACRO_ETFS, SECTOR_ETFS } from '@/lib/data/markets';
import { FINNHUB_BASE_URL, fetchJSON } from '@/lib/finnhub';
import { normalizeQuote, sameListing, sessionFromClock, type MarketSession } from '@/lib/market-data';
import { cache } from 'react';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    const range = getDateRange(5);
    const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';
    if (!token) throw new Error('FINNHUB_API_KEY must be set within .env');

    const cleanSymbols = (symbols || [])
      .map((s) => s?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s));

    const maxArticles = 6;

    // If we have symbols, try to fetch company news per symbol and round-robin select
    if (cleanSymbols.length > 0) {
      const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

      await Promise.all(
        cleanSymbols.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            perSymbolArticles[sym] = (articles || []).filter(validateArticle);
          } catch (e) {
            console.error('Error fetching company news for', sym, e);
            perSymbolArticles[sym] = [];
          }
        })
      );

      const collected: MarketNewsArticle[] = [];
      // Round-robin up to 6 picks
      for (let round = 0; round < maxArticles; round++) {
        for (let i = 0; i < cleanSymbols.length; i++) {
          const sym = cleanSymbols[i];
          const list = perSymbolArticles[sym] || [];
          if (list.length === 0) continue;
          const article = list.shift();
          if (!article || !validateArticle(article)) continue;
          collected.push(formatArticle(article, true, sym, round));
          if (collected.length >= maxArticles) break;
        }
        if (collected.length >= maxArticles) break;
      }

      if (collected.length > 0) {
        // Sort by datetime desc
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
      }
      // If none collected, fall through to general news
    }

    // General market news fallback or when no symbols provided
    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
    const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

    const seen = new Set<string>();
    const unique: RawNewsArticle[] = [];
    for (const art of general || []) {
      if (!validateArticle(art)) continue;
      const key = `${art.id}-${art.url}-${art.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(art);
      if (unique.length >= 20) break; // cap early before final slicing
    }

    const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
    return formatted;
  } catch (err) {
    console.error('getNews error:', err);
    throw new Error('Failed to fetch news');
  }
}

type FinnhubProfile = { name?: string; ticker?: string; exchange?: string };

// The search window's searches and quotes are server actions anyone could call with any text,
// so they only answer signed-in users. That keeps strangers from using up the Finnhub plan's 60 requests a minute.
const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    const requestHeaders = await headers();
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    return !!session?.user;
  } catch (e) {
    console.error('Error checking the session:', e);
    return false;
  }
});

// Up to 20 US stocks and funds matching a symbol or company name, or the popular stocks when there's no search text
export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  try {
    const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      // If no token, log and return empty so the header still renders
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    if (!(await isSignedIn())) return [];

    const trimmed = typeof query === 'string' ? query.trim().slice(0, 50) : '';

    let results: { symbol: string; name: string; exchange?: string; type?: string }[] = [];

    if (!trimmed) {
      // Fetch top 10 popular symbols' profiles
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
            // Revalidate every hour
            const profile = await fetchJSON<FinnhubProfile>(url, 3600);
            return { sym, profile };
          } catch (e) {
            console.error('Error fetching profile2 for', sym, e);
            return { sym, profile: null };
          }
        })
      );

      results = profiles.flatMap(({ sym, profile }) => {
        const name = profile?.name || profile?.ticker;
        if (!name) return [];
        return [{
          symbol: sym.toUpperCase(),
          name,
          type: 'Common Stock',
          exchange: toTradingViewExchange(profile?.exchange) ?? profile?.exchange,
        }];
      });
    } else {
      // Only US listings, since those are the ones Finnhub's free plan has prices for
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&exchange=US&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      results = (Array.isArray(data?.result) ? data.result : []).map((r) => ({
        symbol: r.symbol,
        name: r.description,
        type: r.type,
      }));
    }

    const seen = new Set<string>();
    return results
      .flatMap((r) => {
        const upper = (r.symbol || '').toUpperCase();
        if (!upper || seen.has(upper)) return [];
        seen.add(upper);
        return [{
          symbol: upper,
          name: r.name || upper,
          exchange: r.exchange || 'US',
          type: r.type || 'Common Stock',
          isInWatchlist: false,
        }];
      })
      .slice(0, 20);
  } catch (err) {
    console.error('Error in stock search:', err);
    return [];
  }
});

type FinnhubQuote = { c?: number; d?: number; dp?: number };
type FinnhubStockProfile = { name?: string; marketCapitalization?: number };
type FinnhubMetrics = { metric?: { peTTM?: number; peBasicExclExtraTTM?: number } };

export type StockMarketData = {
  name?: string;
  currentPrice?: number;
  changeAmount?: number;
  changePercent?: number;
  marketCap?: number; // in millions, as Finnhub returns it
  peRatio?: number;
};

// Price, change, market cap and P/E for one stock. Any piece that fails to load is left out.
export async function getStockMarketData(symbol: string): Promise<StockMarketData> {
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) {
    console.error('getStockMarketData:', new Error('FINNHUB API key is not configured'));
    return {};
  }

  const sym = encodeURIComponent(symbol.toUpperCase());
  const [quote, profile, metrics] = await Promise.all([
    fetchJSON<FinnhubQuote>(`${FINNHUB_BASE_URL}/quote?symbol=${sym}&token=${token}`, 60).catch((e) => {
      console.error('Error fetching quote for', symbol, e);
      return null;
    }),
    fetchJSON<FinnhubStockProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${sym}&token=${token}`, 3600).catch((e) => {
      console.error('Error fetching profile2 for', symbol, e);
      return null;
    }),
    fetchJSON<FinnhubMetrics>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${sym}&metric=all&token=${token}`, 3600).catch((e) => {
      console.error('Error fetching metrics for', symbol, e);
      return null;
    }),
  ]);

  // Finnhub returns a price of 0 for symbols it has no quote for
  const hasQuote = !!quote?.c;

  return {
    name: profile?.name || undefined,
    currentPrice: hasQuote ? quote?.c : undefined,
    changeAmount: hasQuote ? quote?.d ?? undefined : undefined,
    changePercent: hasQuote ? quote?.dp ?? undefined : undefined,
    marketCap: profile?.marketCapitalization || undefined,
    peRatio: metrics?.metric?.peTTM ?? metrics?.metric?.peBasicExclExtraTTM ?? undefined,
  };
}

// Recent news about one company from the past week, newest first, without repeated headlines.
// Returns null when the news can't be loaded, so the page can say so instead of "no news".
export async function getCompanyNews(symbol: string, limit = 20): Promise<MarketNewsArticle[] | null> {
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) {
    console.error('getCompanyNews:', new Error('FINNHUB API key is not configured'));
    return null;
  }

  const sym = symbol.toUpperCase();
  const range = getDateRange(7);

  try {
    const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
    const articles = await fetchJSON<RawNewsArticle[]>(url, 300);

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

// Turns Finnhub's exchange name (like "NASDAQ NMS - GLOBAL MARKET") into TradingView's prefix
const toTradingViewExchange = (exchange?: string) => {
  const name = exchange?.toUpperCase() ?? '';
  if (name.includes('NASDAQ')) return 'NASDAQ';
  if (name.includes('NYSE MKT') || name.includes('AMERICAN') || name.includes('ARCA')) return 'AMEX';
  if (name.includes('NEW YORK STOCK EXCHANGE') || name === 'NYSE') return 'NYSE';
  if (name.includes('CBOE') || name.includes('BATS')) return 'CBOE';
  return undefined;
};

type FinnhubFullQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number };
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

export type StockOverview = {
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

// Finnhub sometimes sends 0 or nothing for figures it doesn't have
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const nonZero = (value: unknown) => num(value) || undefined;

// A stock's price today with its name, logo and exchange: what the search window previews
export type StockQuote = Omit<StockOverview, 'peRatio' | 'eps' | 'dividendYield' | 'beta' | 'week52High' | 'week52Low'>;

// Tickers are letters and digits, sometimes with a dot or dash (BRK.B)
const isValidSymbol = (symbol: string) => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol);

// The quote is kept for a minute and the profile for an hour, shared by every page that asks
const fetchQuote = async (sym: string, token: string): Promise<StockQuote> => {
  const q = encodeURIComponent(sym);
  const [quote, profile] = await Promise.all([
    fetchJSON<FinnhubFullQuote>(`${FINNHUB_BASE_URL}/quote?symbol=${q}&token=${token}`, 60).catch((e) => {
      console.error('Error fetching quote for', sym, e);
      return null;
    }),
    fetchJSON<FinnhubFullProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${q}&token=${token}`, 3600).catch((e) => {
      console.error('Error fetching profile2 for', sym, e);
      return null;
    }),
  ]);

  // Finnhub returns a price of 0 for symbols it has no quote for, which normalizeQuote drops
  const latest = normalizeQuote(quote);
  const prefix = toTradingViewExchange(profile?.exchange);

  return {
    symbol: sym,
    tradingViewSymbol: prefix ? `${prefix}:${sym}` : sym,
    name: profile?.name || undefined,
    logo: profile?.logo || undefined,
    exchange: prefix ?? (profile?.exchange || undefined),
    industry: profile?.finnhubIndustry || undefined,
    // Finnhub's free plan only prices US listings, which trade in dollars. Its profile currency is the currency the
    // company reports in (TWD for Taiwan Semiconductor's ADR), so it isn't used for prices, and a market cap
    // in another currency is left out rather than shown as dollars.
    currency: 'USD',
    website: profile?.weburl && /^https?:\/\//i.test(profile.weburl) ? profile.weburl : undefined,
    price: latest?.price,
    change: latest?.change,
    changePercent: latest?.changePercent,
    open: latest?.open,
    previousClose: latest?.previousClose ?? nonZero(quote?.pc),
    dayHigh: latest?.dayHigh,
    dayLow: latest?.dayLow,
    marketCap: !profile?.currency || profile.currency === 'USD' ? nonZero(profile?.marketCapitalization) : undefined,
  };
};

// The price and company details the search window shows for the highlighted stock
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const sym = String(symbol ?? '').trim().toUpperCase();
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token || !isValidSymbol(sym) || !(await isSignedIn())) {
    if (!token) console.error('getStockQuote:', new Error('FINNHUB API key is not configured'));
    return { symbol: sym, tradingViewSymbol: sym, currency: 'USD' };
  }

  return fetchQuote(sym, token);
}

// Everything the top of a stock's page shows: name, logo, price and key figures.
// Pieces that fail to load are left out, so the page still renders.
export async function getStockOverview(symbol: string): Promise<StockOverview> {
  const sym = symbol.toUpperCase();
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) {
    console.error('getStockOverview:', new Error('FINNHUB API key is not configured'));
    return { symbol: sym, tradingViewSymbol: sym, currency: 'USD' };
  }

  const [quote, metrics] = await Promise.all([
    fetchQuote(sym, token),
    fetchJSON<FinnhubAllMetrics>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${token}`, 3600).catch((e) => {
      console.error('Error fetching metrics for', sym, e);
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

export type { MarketSession };

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
};

type FinnhubMarketStatus = { isOpen?: boolean; session?: string | null; holiday?: string | null };

// Index, gold, oil and bond fund prices, plus the sector funds when the page shows sector performance
export async function getMarketSnapshot(includeSectors = false): Promise<MarketSnapshot> {
  const symbols: string[] = [
    ...INDEX_ETFS.map(({ symbol }) => symbol),
    ...MACRO_ETFS.map(({ symbol }) => symbol),
    ...(includeSectors ? SECTOR_ETFS.map(({ symbol }) => symbol) : []),
  ];
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) {
    console.error('getMarketSnapshot:', new Error('FINNHUB API key is not configured'));
    return { session: sessionFromClock(Date.now()), quotes: {} };
  }

  const [status, quotes] = await Promise.all([
    fetchJSON<FinnhubMarketStatus>(`${FINNHUB_BASE_URL}/stock/market-status?exchange=US&token=${token}`, 60).catch((e) => {
      console.error('Error fetching market status', e);
      return null;
    }),
    Promise.all(
      symbols.map((symbol) =>
        fetchJSON<FinnhubFullQuote & { t?: number }>(`${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${token}`, 60).catch((e) => {
          console.error('Error fetching quote for', symbol, e);
          return null;
        })
      )
    ),
  ]);

  const snapshot: MarketSnapshot = { session: sessionFromClock(Date.now()), quotes: {} };
  if (status) {
    const session = status.session;
    snapshot.session = session === 'pre-market' || session === 'regular' || session === 'post-market'
      ? session
      : status.isOpen ? 'regular' : 'closed';
    snapshot.holiday = status.holiday || undefined;
  }

  symbols.forEach((symbol, i) => {
    // Finnhub returns a price of 0 for symbols it has no quote for, which normalizeQuote drops
    const quote = normalizeQuote(quotes[i]);
    if (!quote) return;
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

  return snapshot;
}
