import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { MAX_FAILURES_PER_ADDRESS, TOO_MANY_ATTEMPTS_MESSAGE } from '@/lib/sign-in-limit';

// The sign-in server action with the app's real Better Auth setup: an in-memory database for the accounts and a small
// in-memory stand-in for the sign_in_failures collection
type Failure = { key: string; at: Date };
let failures: Failure[] = [];
const failureCollection = {
  createIndex: async () => 'ok',
  insertMany: async (docs: Failure[]) => { failures.push(...docs); },
  countDocuments: async ({ key, at }: { key: string; at: { $gt: Date } }) => failures.filter((f) => f.key === key && f.at > at.$gt).length,
};
const store: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
let requestHeaders = new Headers({ 'x-forwarded-for': '203.0.113.7' });

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));
vi.mock('@/database/mongoose', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: () => failureCollection } } }) }));
vi.mock('better-auth/adapters/mongodb', () => ({ mongodbAdapter: () => memoryAdapter(store) }));

process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.ALLOWED_EMAILS = 'owner@example.com';

const { getAuth } = await import('@/lib/better-auth/auth');
const { signInWithEmail } = await import('@/lib/actions/auth.actions');
const password = 'correct-horse-battery';
await (await getAuth()).api.signUpEmail({ body: { email: 'owner@example.com', password, name: 'Owner' } });

describe('signing in through the server action', () => {
  beforeEach(() => {
    failures = [];
    requestHeaders = new Headers({ 'x-forwarded-for': '203.0.113.7' });
  });

  it('signs the owner in without sending the session token back to the page', async () => {
    const result = await signInWithEmail({ email: 'owner@example.com', password });
    expect(result).toEqual({ success: true });
  });

  it('pauses an address after repeated wrong passwords, even for the right one', async () => {
    for (let i = 0; i < MAX_FAILURES_PER_ADDRESS; i++) {
      const result = await signInWithEmail({ email: 'owner@example.com', password: 'wrong-password' });
      expect(result.success).toBe(false);
      expect(result.error).not.toBe(TOO_MANY_ATTEMPTS_MESSAGE);
    }
    expect(await signInWithEmail({ email: 'owner@example.com', password })).toEqual({ success: false, error: TOO_MANY_ATTEMPTS_MESSAGE });

    // Another address still gets in
    requestHeaders = new Headers({ 'x-forwarded-for': '198.51.100.2' });
    expect(await signInWithEmail({ email: 'owner@example.com', password })).toEqual({ success: true });
  });

  it('counts emails that are not allowed too', async () => {
    for (let i = 0; i < MAX_FAILURES_PER_ADDRESS; i++) await signInWithEmail({ email: `guess${i}@example.com`, password });
    expect((await signInWithEmail({ email: 'owner@example.com', password })).error).toBe(TOO_MANY_ATTEMPTS_MESSAGE);
  });

  it('turns away input that is not text before reading it', async () => {
    const odd = { email: { $ne: null }, password } as unknown as SignInFormData;
    expect((await signInWithEmail(odd)).success).toBe(false);
    expect(failures).toHaveLength(0);
  });

  it('keeps going when the attempt store is unreachable', async () => {
    const count = failureCollection.countDocuments;
    failureCollection.countDocuments = async () => { throw new Error('mongodb://secret-host down'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await signInWithEmail({ email: 'owner@example.com', password })).toEqual({ success: true });
    } finally {
      failureCollection.countDocuments = count;
      vi.restoreAllMocks();
    }
  });
});
