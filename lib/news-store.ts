import 'server-only';

import { connectToDatabase } from '@/database/mongoose';
import { NewsPrefs } from '@/database/models/news-prefs.model';
import { MAX_SAVED, parseNewsPrefs, parseSaved, type NewsPrefs as Prefs, type SavedArticle } from '@/lib/news';

// The News page's saved settings and bookmarks, per user, in MongoDB (collection news_prefs)

export const loadNewsPrefs = async (userId: string): Promise<{ prefs: Prefs; saved: SavedArticle[] }> => {
  await connectToDatabase();
  const record = await NewsPrefs.findOne({ userId }, { prefs: 1, saved: 1 }).lean();
  return { prefs: parseNewsPrefs(record?.prefs), saved: parseSaved(record?.saved) };
};

export const saveNewsPrefs = async (userId: string, prefs: Prefs) => {
  await connectToDatabase();
  await NewsPrefs.updateOne({ userId }, { $set: { prefs, updatedAt: new Date() } }, { upsert: true });
};

// Removes the article when it's saved, otherwise saves it first in the list (the oldest drop off past MAX_SAVED).
// Both steps are conditional single-document updates: the add only matches a list without this link, so two tabs
// saving the same article at once can't store it twice (the second one finds it there, or, for a user with no
// document yet, loses the insert race on the unique userId and does nothing).
export const toggleSavedArticle = async (userId: string, article: SavedArticle): Promise<SavedArticle[]> => {
  await connectToDatabase();
  const removed = await NewsPrefs.updateOne({ userId, 'saved.url': article.url }, { $pull: { saved: { url: article.url } }, $set: { updatedAt: new Date() } });
  if (removed.matchedCount === 0) {
    try {
      await NewsPrefs.updateOne(
        { userId, 'saved.url': { $ne: article.url } },
        { $push: { saved: { $each: [article], $position: 0, $slice: MAX_SAVED } }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      // The list already has it (saved from another tab a moment ago), so the upsert tried a second document
      if ((e as { code?: number })?.code !== 11000) throw e;
    }
  }
  return (await loadNewsPrefs(userId)).saved;
};
