'use server';

import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { WorkspaceModel } from '@/database/models/workspace.model';
import { getSession } from '@/lib/better-auth/auth';
import { parseStore, type WorkspaceStore } from '@/lib/workspace';

// A saved store is a few kilobytes; anything far larger isn't one
const MAX_BYTES = 64_000;

async function currentUserId(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.user?.id ?? null;
}

// The signed-in user's saved workspaces: the store, null when they haven't saved any, or 'unavailable' when the
// database couldn't be read (the page then keeps the browser's copy and says saving is off)
export async function getWorkspaceStore(): Promise<WorkspaceStore | null | 'unavailable'> {
  const userId = await currentUserId();
  if (!userId) return 'unavailable';
  try {
    await connectToDatabase();
    const doc = await WorkspaceModel.findOne({ userId }).lean();
    return doc ? parseStore(doc.store) ?? null : null;
  } catch (err) {
    console.error('getWorkspaceStore error:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}

// Saves the whole store after checking it field by field, so nothing a browser sends can break a later page load
export async function saveWorkspaceStore(store: unknown): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const clean = parseStore(store);
  if (!clean || JSON.stringify(clean).length > MAX_BYTES) return { ok: false };
  try {
    await connectToDatabase();
    await WorkspaceModel.updateOne({ userId }, { $set: { store: clean, updatedAt: new Date() } }, { upsert: true });
    return { ok: true };
  } catch (err) {
    console.error('saveWorkspaceStore error:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
