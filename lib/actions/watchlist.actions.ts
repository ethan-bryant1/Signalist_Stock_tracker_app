'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { getAuth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

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
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
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
