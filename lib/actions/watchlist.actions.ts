'use server';

import { connectToDatabase } from '@/database/mongoose';
import { getSession } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { loadWatchlists, newListId, updateWatchlists } from '@/lib/watchlist-store';
import {
  activeList,
  addItem,
  allSymbols,
  createList,
  deleteList,
  moveItem,
  normalizeListSymbol,
  removeItem,
  renameList,
  setActiveList,
  setPrefs,
  type OpResult,
  type WatchlistDoc,
} from '@/lib/watchlists';

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

// Returns the signed-in user's id, or null when nobody is signed in
async function getCurrentUserId(): Promise<string | null> {
  // Read headers first so Next renders pages using this per request instead of at build time
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  return session?.user?.id ?? null;
}

// ---------- The open list, for the stock page's button, the search window's stars and the workspace widget ----------

// Whether the symbol is in the list open on the Watchlist page (the list the star buttons add to)
export async function isStockInWatchlist(symbol: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return false;
    const sym = normalizeListSymbol(symbol);
    return activeList(await loadWatchlists(userId)).items.some((item) => item.symbol === sym);
  } catch (err) {
    console.error('isStockInWatchlist error:', err);
    return false;
  }
}

// The open list's stocks in its own order, without prices
export async function getWatchlistSymbols(): Promise<{ symbol: string; company: string }[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    return activeList(await loadWatchlists(userId)).items.map(({ symbol, company }) => ({ symbol, company }));
  } catch (err) {
    console.error('getWatchlistSymbols error:', err);
    throw new Error('Could not load the watchlist');
  }
}

export async function addToWatchlist(symbol: string, company: string): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return { success: false };
    const sym = normalizeListSymbol(symbol);
    // Already there counts as done, as adding twice did before lists
    const result = await updateWatchlists(userId, (doc) => {
      const list = activeList(doc);
      return list.items.some((item) => item.symbol === sym) ? { ok: true, doc } : addItem(doc, list.id, sym, company, Date.now());
    });
    return { success: result.ok };
  } catch (err) {
    console.error('addToWatchlist error:', err);
    return { success: false };
  }
}

export async function removeFromWatchlist(symbol: string): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !symbol) return { success: false };
    const sym = normalizeListSymbol(symbol);
    const result = await updateWatchlists(userId, (doc) => {
      const list = activeList(doc);
      return list.items.some((item) => item.symbol === sym) ? removeItem(doc, list.id, sym) : { ok: true, doc };
    });
    return { success: result.ok };
  } catch (err) {
    console.error('removeFromWatchlist error:', err);
    return { success: false };
  }
}

// ---------- The Watchlist page ----------

// The signed-in user's lists, or null when the database couldn't be read
export async function getWatchlists(): Promise<WatchlistDoc | null> {
  // Kept outside the try so Next's "render per request" signal from headers() is not swallowed
  const userId = await getCurrentUserId();
  if (!userId) return null;
  try {
    return await loadWatchlists(userId);
  } catch (err) {
    console.error('getWatchlists error:', err instanceof Error ? err.message : err);
    return null;
  }
}

const NOT_SIGNED_IN: OpResult = { ok: false, error: 'Sign in again to change your watchlists' };
const SAVE_FAILED: OpResult = { ok: false, error: "Couldn't save the change. Check your connection and try again." };

// Every change goes through here: it applies to the latest saved copy and returns the new document, or why not
async function change(apply: (doc: WatchlistDoc) => OpResult): Promise<OpResult> {
  const userId = await getCurrentUserId();
  if (!userId) return NOT_SIGNED_IN;
  try {
    return await updateWatchlists(userId, apply);
  } catch (err) {
    console.error('watchlist change error:', err instanceof Error ? err.message : err);
    return SAVE_FAILED;
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function createWatchlist(name: unknown): Promise<OpResult> {
  const id = newListId();
  return change((doc) => createList(doc, text(name), id));
}

export async function renameWatchlist(listId: unknown, name: unknown): Promise<OpResult> {
  return change((doc) => renameList(doc, text(listId), text(name)));
}

export async function deleteWatchlist(listId: unknown): Promise<OpResult> {
  return change((doc) => deleteList(doc, text(listId)));
}

export async function openWatchlist(listId: unknown): Promise<OpResult> {
  return change((doc) => setActiveList(doc, text(listId)));
}

// Adds a symbol to a list; index puts it back where it was when undoing a removal
export async function addWatchlistSymbol(listId: unknown, symbol: unknown, company: unknown, index?: unknown): Promise<OpResult> {
  const at = typeof index === 'number' && Number.isFinite(index) ? index : undefined;
  return change((doc) => addItem(doc, text(listId), text(symbol), text(company), Date.now(), at));
}

export async function removeWatchlistSymbol(listId: unknown, symbol: unknown): Promise<OpResult> {
  return change((doc) => removeItem(doc, text(listId), text(symbol)));
}

export async function moveWatchlistSymbol(listId: unknown, symbol: unknown, toIndex: unknown): Promise<OpResult> {
  if (typeof toIndex !== 'number' || !Number.isFinite(toIndex)) return { ok: false, error: 'Nowhere to move it' };
  return change((doc) => moveItem(doc, text(listId), text(symbol), toIndex));
}

// Columns, sorting, row density and the details panel
export async function saveWatchlistPrefs(prefs: unknown): Promise<OpResult> {
  return change((doc) => setPrefs(doc, prefs));
}
