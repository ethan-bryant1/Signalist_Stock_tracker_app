'use server';

import { headers } from 'next/headers';
import { getSession } from '@/lib/better-auth/auth';
import { parseNewsPrefs, parseSaved, type NewsPrefs, type SavedArticle } from '@/lib/news';
import { saveNewsPrefs, toggleSavedArticle } from '@/lib/news-store';

// Saving the News page's settings and bookmarks for the signed-in user. Each answer says whether it worked, so the
// page can tell the user instead of pretending.

const currentUserId = async () => (await getSession(await headers()))?.user?.id ?? null;

export async function saveNewsSettings(value: NewsPrefs): Promise<{ ok: boolean }> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false };
    await saveNewsPrefs(userId, parseNewsPrefs(value));
    return { ok: true };
  } catch (e) {
    console.error('saveNewsSettings error:', e);
    return { ok: false };
  }
}

export async function toggleBookmark(value: SavedArticle): Promise<{ ok: true; saved: SavedArticle[] } | { ok: false }> {
  try {
    const userId = await currentUserId();
    // Only a well-formed article is stored (checked the same way as on every read)
    const [article] = parseSaved([value]);
    if (!userId || !article) return { ok: false };
    return { ok: true, saved: await toggleSavedArticle(userId, { ...article, savedAt: Date.now() }) };
  } catch (e) {
    console.error('toggleBookmark error:', e);
    return { ok: false };
  }
}
