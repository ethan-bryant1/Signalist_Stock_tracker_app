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
// saving the same article at once can't store it twice. For a user with no document yet, two saves at once both try
// to create it; the loser hits the unique userId and adds again to the document the winner made (still only when the
// link isn't there).
export const toggleSavedArticle = async (userId: string, article: SavedArticle): Promise<SavedArticle[]> => {
  await connectToDatabase();
  const removed = await NewsPrefs.updateOne({ userId, 'saved.url': article.url }, { $pull: { saved: { url: article.url } }, $set: { updatedAt: new Date() } });
  if (removed.matchedCount === 0) {
    const add = (upsert: boolean) =>
      NewsPrefs.updateOne(
        { userId, 'saved.url': { $ne: article.url } },
        { $push: { saved: { $each: [article], $position: 0, $slice: MAX_SAVED } }, $set: { updatedAt: new Date() } },
        { upsert }
      );
    try {
      await add(true);
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e;
      await add(false);
    }
  }
  return (await loadNewsPrefs(userId)).saved;
};
