import 'server-only';

import { connectToDatabase } from '@/database/mongoose';
import type { SlowStore } from '@/lib/providers/gate';

// Provider answers that change slowly (company profiles, key ratios), kept in MongoDB so a restart, a deploy or a
// second server instance doesn't fetch them all again. Keys never contain API keys. MongoDB deletes each document
// once its keep time has passed (a TTL index on keepUntil).

const COLLECTION = 'provider_cache';

type StoredAnswer = { _id: string; data: unknown; fetchedAt: Date; keepUntil: Date };

let indexReady: Promise<unknown> | undefined;

const collection = async () => {
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection not found');
  const answers = db.collection<StoredAnswer>(COLLECTION);
  indexReady ??= answers.createIndex({ keepUntil: 1 }, { expireAfterSeconds: 0 }).catch((e) => {
    indexReady = undefined;
    console.error('provider_cache: could not create the expiry index', e);
  });
  return answers;
};

// Without a database (no MONGODB_URI, as in `npm run build` or the checks), the gate simply works from memory
export const mongoSlowStore = (): SlowStore | undefined => {
  if (!process.env.MONGODB_URI) return undefined;
  return {
    async read(key) {
      const answer = await (await collection()).findOne({ _id: key });
      return answer ? { data: answer.data, fetchedAt: answer.fetchedAt.getTime() } : null;
    },
    async write(key, data, fetchedAt, keepUntil) {
      await (await collection()).replaceOne(
        { _id: key },
        { data, fetchedAt: new Date(fetchedAt), keepUntil: new Date(keepUntil) },
        { upsert: true }
      );
    },
  };
};
