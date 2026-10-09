'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { getAuth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { getStockMarketData } from '@/lib/actions/finnhub.actions';
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
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
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

// Finnhub's free plan allows about 30 calls a second; each stock makes 3, so load a few stocks at a time
const STOCKS_PER_BATCH = 5;

// The signed-in user's watchlist, newest first, with live price data from Finnhub.
// Returns null when the watchlist could not be loaded, so the page can tell that apart from an empty list.
export async function getWatchlistWithData(): Promise<StockWithData[] | null> {
  // Kept outside the try so Next's "render per request" signal from headers() is not swallowed
  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    await connectToDatabase();
    const items = await Watchlist.find({ userId }).sort({ addedAt: -1 }).lean();

    const result: StockWithData[] = [];
    for (let i = 0; i < items.length; i += STOCKS_PER_BATCH) {
      const batch = items.slice(i, i + STOCKS_PER_BATCH);
      const rows = await Promise.all(
        batch.map(async (item) => {
          const data = await getStockMarketData(item.symbol);
          const changeAmount = data.changeAmount;

          return {
            _id: String(item._id),
            userId: item.userId,
            symbol: item.symbol,
            company: data.name || item.company,
            addedAt: item.addedAt,
            currentPrice: data.currentPrice,
            changePercent: data.changePercent,
            changeAmount,
            priceFormatted: data.currentPrice !== undefined ? formatPrice(data.currentPrice) : '—',
            changeFormatted: formatChangePercent(data.changePercent) || '—',
            changeAmountFormatted:
              changeAmount !== undefined ? `${changeAmount > 0 ? '+' : ''}${changeAmount.toFixed(2)}` : '',
            marketCap: data.marketCap ? formatMarketCapValue(data.marketCap) : '—',
            peRatio: data.peRatio !== undefined ? data.peRatio.toFixed(1) : '—',
          };
        })
      );
      result.push(...rows);
    }
    return result;
  } catch (err) {
    console.error('getWatchlistWithData error:', err);
    return null;
  }
}
