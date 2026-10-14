'use server';

import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { PortfolioModel } from '@/database/models/portfolio.model';
import { getSession } from '@/lib/better-auth/auth';
import { parsePortfolioDoc, type PortfolioDoc } from '@/lib/portfolio';

// A saved document is a few kilobytes even with 20 portfolios; anything far larger isn't one
const MAX_BYTES = 64_000;

async function currentUserId(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.user?.id ?? null;
}

// The signed-in user's saved portfolios: the document, null when they haven't saved any, or 'unavailable' when the
// database couldn't be read (the page then works without saving and says so)
export async function getPortfolios(): Promise<PortfolioDoc | null | 'unavailable'> {
  const userId = await currentUserId();
  if (!userId) return 'unavailable';
  try {
    await connectToDatabase();
    const record = await PortfolioModel.findOne({ userId }).lean();
    return record ? parsePortfolioDoc(record.doc) ?? null : null;
  } catch (err) {
    console.error('getPortfolios error:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}

// Saves the whole document after checking it field by field. expectedUserId is the account the page was opened in:
// a save that runs after someone else signed in is refused.
export async function savePortfolios(doc: unknown, expectedUserId: unknown): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || userId !== expectedUserId) return { ok: false };
  const clean = parsePortfolioDoc(doc);
  if (!clean || JSON.stringify(clean).length > MAX_BYTES) return { ok: false };
  try {
    await connectToDatabase();
    await PortfolioModel.updateOne({ userId }, { $set: { doc: clean, updatedAt: new Date() } }, { upsert: true });
    return { ok: true };
  } catch (err) {
    console.error('savePortfolios error:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
