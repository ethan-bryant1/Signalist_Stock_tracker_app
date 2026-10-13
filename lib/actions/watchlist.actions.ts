'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { getSession } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { getStockOverview } from '@/lib/stock-data';
import { formatChangePercent, formatMarketCapValue, formatPrice } from '@/lib/utils';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Better Auth stores users in the "user" collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({ email });

    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}

// Returns the signed-in user's id, or null when nobody is signed in
async function getCurrentUserId(): Promise<string | null> {
  // Read headers first so Next renders pages using this per request instead of at build time
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  return session?.user?.id ?? null;
}

export async function isStockInWatchlist(symbol: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return false;

    await connectToDatabase();
    const item = await Watchlist.exists({ userId, symbol: symbol.toUpperCase() });
    return !!item;
  } catch (err) {
    console.error('isStockInWatchlist error:', err);
    return false;
  }
}

// The signed-in user's saved stocks, newest first, without prices (for the search window's stars)
export async function getWatchlistSymbols(): Promise<{ symbol: string; company: string }[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    await connectToDatabase();
    const items = await Watchlist.find({ userId }, { symbol: 1, company: 1 }).sort({ addedAt: -1 }).lean();
    return items.map((item) => ({ symbol: String(item.symbol), company: String(item.company || item.symbol) }));
  } catch (err) {
    console.error('getWatchlistSymbols error:', err);
    throw new Error('Could not load the watchlist');
  }
}

export async function addToWatchlist(symbol: string, company: string): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return { success: false };

    await connectToDatabase();
    const upper = symbol.toUpperCase();
    // Upsert so adding the same stock twice does not hit the unique index
    await Watchlist.updateOne(
      { userId, symbol: upper },
      { $setOnInsert: { userId, symbol: upper, company: company || upper, addedAt: new Date() } },
      { upsert: true }
    );
    return { success: true };
  } catch (err) {
    console.error('addToWatchlist error:', err);
    return { success: false };
  }
}

export async function removeFromWatchlist(symbol: string): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return { success: false };

    await connectToDatabase();
    await Watchlist.deleteOne({ userId, symbol: symbol.toUpperCase() });
    return { success: true };
  } catch (err) {
    console.error('removeFromWatchlist error:', err);
    return { success: false };
  }
}

// The signed-in user's watchlist, newest first, with prices from Finnhub (through the shared gate, which paces the
// requests within the free plan's budget and reuses what other pages already loaded).
// Returns null when the watchlist could not be loaded, so the page can tell that apart from an empty list.
export async function getWatchlistWithData(): Promise<StockWithData[] | null> {
  // Kept outside the try so Next's "render per request" signal from headers() is not swallowed
  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    await connectToDatabase();
    const items = await Watchlist.find({ userId }).sort({ addedAt: -1 }).lean();

    const result: StockWithData[] = await Promise.all(
      items.map(async (item) => {
        const data = await getStockOverview(item.symbol);
        const changeAmount = data.change;

        return {
          _id: String(item._id),
          userId: item.userId,
          symbol: item.symbol,
          company: data.name || item.company,
          addedAt: item.addedAt,
          currentPrice: data.price,
          changePercent: data.changePercent,
          changeAmount,
          priceFormatted: data.price !== undefined ? formatPrice(data.price) : '—',
          changeFormatted: formatChangePercent(data.changePercent) || '—',
          changeAmountFormatted:
            changeAmount !== undefined ? `${changeAmount > 0 ? '+' : ''}${changeAmount.toFixed(2)}` : '',
          marketCap: data.marketCap ? formatMarketCapValue(data.marketCap) : '—',
          peRatio: data.peRatio !== undefined ? data.peRatio.toFixed(1) : '—',
          quoteTime: data.quoteTime,
          receivedAt: data.receivedAt,
          cached: data.cached,
          checkedAt: data.checkedAt,
          issue: data.issue,
        };
      })
    );
    return result;
  } catch (err) {
    console.error('getWatchlistWithData error:', err);
    return null;
  }
}
