import 'server-only';

import { connectToDatabase } from '@/database/mongoose';
import { isAllowedEmail } from '@/lib/owner-access';
import { loadWatchlists } from '@/lib/watchlist-store';
import { allSymbols } from '@/lib/watchlists';

// Who gets the daily news email and which symbols it covers. Only the Inngest job calls these. They read any user by
// email, so they're plain server code, never server actions (a 'use server' export can be called from the browser).

export const getAllUsersForNewsEmail = async () => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if(!db) throw new Error('Mongoose connection not connected');

        const users = await db.collection('user').find(
            { email: { $exists: true, $ne: null }},
            { projection: { _id: 1, id: 1, email: 1, name: 1, country:1 }}
        ).toArray();

        // Only people allowed on the site get the news, which comes from Finnhub too
        return users.filter((user) => user.email && user.name && isAllowedEmail(user.email)).map((user) => ({
            id: user.id || user._id?.toString() || '',
            email: user.email,
            name: user.name
        }))
    } catch (e) {
        console.error('Error fetching users for news email:', e)
        return []
    }
}

// Every symbol in the user's lists, for the daily news email
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

    return allSymbols(await loadWatchlists(userId));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}
