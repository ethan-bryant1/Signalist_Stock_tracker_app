'use server';

import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { FINNHUB_CACHE, finnhubData, getFinnhubToken } from '@/lib/finnhub';
import { issueOf } from '@/lib/providers/gate';
import { getStockQuoteData, isValidSymbol, toTradingViewExchange, type StockQuote } from '@/lib/stock-data';
import { cache } from 'react';
import { headers } from 'next/headers';
import { getSession } from '@/lib/better-auth/auth';

// The only Finnhub figures the browser asks for directly: the search window's results and its quote preview.
// Pages get everything else on the server (lib/stock-data.ts).

export type { StockQuote };

type FinnhubProfile = { name?: string; ticker?: string; exchange?: string };

// The search window's searches and quotes are server actions anyone could call with any text,
// so they only answer signed-in users. That keeps strangers from using up the Finnhub plan's 60 requests a minute.
const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    const requestHeaders = await headers();
    const session = await getSession(requestHeaders);
    return !!session?.user;
  } catch (e) {
    console.error('Error checking the session:', e);
    return false;
  }
});

// Up to 20 US stocks and funds matching a symbol or company name, or the popular stocks when there's no search text.
// A search Finnhub couldn't answer (rate limit, outage) throws, so the window can say the search is unavailable
// instead of "no matches".
export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  const trimmed = typeof query === 'string' ? query.trim().slice(0, 50) : '';
  try {
    if (!getFinnhubToken()) {
      // If no token, log and return empty so the header still renders
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    if (!(await isSignedIn())) return [];

    let results: { symbol: string; name: string; exchange?: string; type?: string }[] = [];

    if (!trimmed) {
      // Fetch top 10 popular symbols' profiles
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const profile = await finnhubData<FinnhubProfile>('/stock/profile2', { symbol: sym }, { ...FINNHUB_CACHE.profile, waitMs: 3000 });
            return { sym, profile };
          } catch (e) {
            console.error('Error fetching profile2 for', sym, issueOf(e));
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
      const data = await finnhubData<FinnhubSearchResponse>('/search', { q: trimmed, exchange: 'US' }, { ...FINNHUB_CACHE.search, waitMs: 5000 });
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
    console.error('Error in stock search:', issueOf(err));
    if (trimmed) throw new Error('Search is unavailable right now');
    return [];
  }
});

// The price and company details the search window shows for the highlighted stock
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const sym = String(symbol ?? '').trim().toUpperCase();
  if (!getFinnhubToken()) {
    return { symbol: sym, tradingViewSymbol: sym, currency: 'USD', issue: 'not-configured' };
  }
  if (!isValidSymbol(sym) || !(await isSignedIn())) return { symbol: sym, tradingViewSymbol: sym, currency: 'USD' };

  return getStockQuoteData(sym);
}

