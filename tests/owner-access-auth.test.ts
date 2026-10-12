import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';

// Runs the app's real Better Auth setup against an in-memory database instead of MongoDB
const store: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
vi.mock('@/database/mongoose', () => ({ connectToDatabase: async () => ({ connection: { db: {} } }) }));
vi.mock('better-auth/adapters/mongodb', () => ({ mongodbAdapter: () => memoryAdapter(store) }));

process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';

const { getAuth, getSession } = await import('@/lib/better-auth/auth');
const password = 'correct-horse-battery';
const signUp = async (email: string) => (await getAuth()).api.signUpEmail({ body: { email, password, name: 'Test' } });
const signIn = async (email: string) => (await getAuth()).api.signInEmail({ body: { email, password } });
const cookieFor = async (email: string) => {
  const response = await (await getAuth()).api.signInEmail({ body: { email, password }, asResponse: true });
  return new Headers({ cookie: response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') });
};

describe('Better Auth only admits ALLOWED_EMAILS', () => {
  beforeEach(() => { process.env.ALLOWED_EMAILS = 'owner@example.com'; });

  it('creates no account for anyone else', async () => {
    await expect(signUp('stranger@example.com')).rejects.toThrow();
    expect(store.user.some((u) => u.email === 'stranger@example.com')).toBe(false);
  });

  it('lets the owner sign up, sign in and keep a session', async () => {
    await signUp('owner@example.com');
    await expect(signIn('owner@example.com')).resolves.toMatchObject({ user: { email: 'owner@example.com' } });
    expect((await getSession(await cookieFor('owner@example.com')))?.user.email).toBe('owner@example.com');
  });

  it('refuses sign-in and existing sessions once an email is taken off the list', async () => {
    const cookie = await cookieFor('owner@example.com');
    process.env.ALLOWED_EMAILS = 'someone-else@example.com';
    await expect(signIn('owner@example.com')).rejects.toThrow();
    expect(await getSession(cookie)).toBeNull();
  });

  it('lets nobody in when the list is missing', async () => {
    delete process.env.ALLOWED_EMAILS;
    await expect(signIn('owner@example.com')).rejects.toThrow();
  });
});
