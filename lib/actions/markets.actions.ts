'use server';

import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { MarketsPrefsModel } from '@/database/models/markets-prefs.model';
import { getSession } from '@/lib/better-auth/auth';
import { DEFAULT_PREFS, parsePrefs, type MarketsPrefs } from '@/lib/screener';

// Thirty presets and a last screen are a few kilobytes; anything far larger isn't a saved screener
const MAX_BYTES = 64_000;

async function currentUserId(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.user?.id ?? null;
}

// The signed-in user's Markets presets and settings, the defaults when they've saved none, or 'unavailable' when the
// database couldn't be read (the page then works from the address and says presets can't be saved)
export async function getMarketsPrefs(): Promise<MarketsPrefs | 'unavailable'> {
  // Kept outside the try so Next's "render per request" signal from headers() is not swallowed
  const userId = await currentUserId();
  if (!userId) return 'unavailable';
  try {
    await connectToDatabase();
    const doc = await MarketsPrefsModel.findOne({ userId }).lean();
    return doc ? parsePrefs(doc.prefs) : DEFAULT_PREFS;
  } catch (err) {
    console.error('getMarketsPrefs error:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}

// Saves the whole document after checking it field by field, so nothing a browser sends can break a later page load
export async function saveMarketsPrefs(prefs: unknown): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const clean = parsePrefs(prefs);
  if (JSON.stringify(clean).length > MAX_BYTES) return { ok: false };
  try {
    await connectToDatabase();
    await MarketsPrefsModel.updateOne({ userId }, { $set: { prefs: clean, updatedAt: new Date() } }, { upsert: true });
    return { ok: true };
  } catch (err) {
    console.error('saveMarketsPrefs error:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
