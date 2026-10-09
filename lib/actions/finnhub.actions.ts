'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fetch failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export { fetchJSON };

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

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  try {
    const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      // If no token, log and return empty so the header still renders
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    const trimmed = typeof query === 'string' ? query.trim() : '';

    let results: (FinnhubSearchResult & { exchange?: string })[] = [];

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
        const symbol = sym.toUpperCase();
        const name = profile?.name || profile?.ticker;
        if (!name) return [];
        return [{
          symbol,
          description: name,
          displaySymbol: symbol,
          type: 'Common Stock',
          exchange: profile?.exchange,
        }];
      });
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      results = Array.isArray(data?.result) ? data.result : [];
    }

    return results
      .map((r) => {
        const upper = (r.symbol || '').toUpperCase();
        return {
          symbol: upper,
          name: r.description || upper,
          exchange: r.exchange || r.displaySymbol || 'US',
          type: r.type || 'Stock',
          isInWatchlist: false,
        };
      })
      .slice(0, 15);
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
