import 'server-only';

import { randomUUID } from 'node:crypto';
import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { WatchlistLists } from '@/database/models/watchlist-lists.model';
import { fromLegacy, parseDoc, type OpResult, type WatchlistDoc } from '@/lib/watchlists';

// A saved document is a few kilobytes even with hundreds of symbols; anything far larger isn't one
const MAX_BYTES = 256_000;
const RETRIES = 3;

export const newListId = () => randomUUID().slice(0, 12);

const readRecord = async (userId: string): Promise<{ doc: unknown; rev: number } | null> => {
  await connectToDatabase();
  const record = await WatchlistLists.findOne({ userId }, { doc: 1, rev: 1 }).lean();
  return record ? { doc: record.doc, rev: record.rev ?? 0 } : null;
};

// False when another request created it first
const insertRecord = async (userId: string, doc: WatchlistDoc): Promise<boolean> => {
  await connectToDatabase();
  try {
    await WatchlistLists.create({ userId, doc, rev: 0, updatedAt: new Date() });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
};

// False when the document changed since it was read
const writeRecord = async (userId: string, doc: WatchlistDoc, rev: number): Promise<boolean> => {
  await connectToDatabase();
  const result = await WatchlistLists.updateOne({ userId, rev }, { $set: { doc, updatedAt: new Date() }, $inc: { rev: 1 } });
  return result.matchedCount === 1;
};

const readLegacy = async (userId: string) => {
  await connectToDatabase();
  return Watchlist.find({ userId }, { symbol: 1, company: 1, addedAt: 1 }).lean();
};

// The user's lists, built from the older single list the first time
const load = async (userId: string): Promise<{ doc: WatchlistDoc; rev: number }> => {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const record = await readRecord(userId);
    if (record) {
      const doc = parseDoc(record.doc);
      if (!doc) throw new Error('Saved watchlists are unreadable');
      return { doc, rev: record.rev };
    }
    const doc = fromLegacy(await readLegacy(userId), newListId());
    if (await insertRecord(userId, doc)) return { doc, rev: 0 };
  }
  throw new Error('Could not create the watchlists');
};

export const loadWatchlists = async (userId: string) => (await load(userId)).doc;

// Applies a change to the latest saved copy, retrying when another tab saved in between
export const updateWatchlists = async (userId: string, change: (doc: WatchlistDoc) => OpResult): Promise<OpResult> => {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { doc, rev } = await load(userId);
    const result = change(doc);
    if (!result.ok) return result;
    if (JSON.stringify(result.doc).length > MAX_BYTES) return { ok: false, error: 'Too much to save' };
    if (await writeRecord(userId, result.doc, rev)) return result;
  }
  return { ok: false, error: 'Another tab is saving; try again' };
};
