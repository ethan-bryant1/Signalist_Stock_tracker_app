import 'server-only';

import { connectToDatabase } from '@/database/mongoose';
import { attemptKeys, SIGN_IN_WINDOW_MS, signInPaused } from '@/lib/sign-in-limit';

// Failed sign-ins in MongoDB (collection sign_in_failures), so the limit holds across Vercel's server instances.
// Each failure is one small document that MongoDB deletes on its own once it's past the window.

const COLLECTION = 'sign_in_failures';
let indexReady: Promise<unknown> | null = null;

const failures = async () => {
    const db = (await connectToDatabase()).connection.db;
    if (!db) throw new Error('MongoDB connection not found');
    const collection = db.collection<{ key: string; at: Date }>(COLLECTION);
    indexReady ??= Promise.all([
        collection.createIndex({ at: 1 }, { expireAfterSeconds: Math.ceil(SIGN_IN_WINDOW_MS / 1000) }),
        collection.createIndex({ key: 1, at: 1 }),
    ]).catch((e) => {
        indexReady = null;
        throw e;
    });
    await indexReady;
    return collection;
};

export const isSignInPaused = async (address: string, email: string): Promise<boolean> => {
    const keys = attemptKeys(address, email);
    const collection = await failures();
    const since = new Date(Date.now() - SIGN_IN_WINDOW_MS);
    const [byAddress, byEmail] = await Promise.all([
        collection.countDocuments({ key: keys.address, at: { $gt: since } }),
        collection.countDocuments({ key: keys.email, at: { $gt: since } }),
    ]);
    return signInPaused({ address: byAddress, email: byEmail });
};

export const recordSignInFailure = async (address: string, email: string) => {
    const keys = attemptKeys(address, email);
    const at = new Date();
    await (await failures()).insertMany([{ key: keys.address, at }, { key: keys.email, at }]);
};
