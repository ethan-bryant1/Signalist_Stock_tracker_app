import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError, RequestGate, type SlowStore } from '@/lib/providers/gate';

// The gate runs on Date.now and setTimeout, both faked here so time only moves when a test moves it
const START = Date.UTC(2026, 9, 13, 14, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

const answer = <T,>(data: T) => vi.fn(async () => ({ data }));

describe('RequestGate cache', () => {
  it('reuses a fresh answer without calling the provider again', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    const fetcher = answer(1);
    const first = await gate.request('k', fetcher, { ttlMs: 60_000 });
    const second = await gate.request('k', fetcher, { ttlMs: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ data: 1, from: 'provider', stale: false });
    expect(second).toMatchObject({ data: 1, from: 'memory', stale: false });
  });

  it('merges identical requests in flight into one call', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    const fetcher = answer('x');
    const results = await Promise.all([1, 2, 3].map(() => gate.request('k', fetcher, { ttlMs: 60_000 })));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.data)).toEqual(['x', 'x', 'x']);
    expect(gate.usage().merged).toBe(2);
  });

  it('serves a stale copy at once and refreshes it in the background', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    let value = 1;
    const fetcher = vi.fn(async () => ({ data: value }));
    await gate.request('k', fetcher, { ttlMs: 60_000, staleMs: 60_000 });
    value = 2;
    vi.setSystemTime(START + 90_000);
    const stale = await gate.request('k', fetcher, { ttlMs: 60_000, staleMs: 60_000 });
    expect(stale).toMatchObject({ data: 1, stale: true });
    await vi.runAllTimersAsync();
    const fresh = await gate.request('k', fetcher, { ttlMs: 60_000, staleMs: 60_000 });
    expect(fresh).toMatchObject({ data: 2, stale: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the stale copy while the provider fails, then gives up after its keep time', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    await gate.request('k', answer('old'), { ttlMs: 60_000, staleMs: 60_000 });
    const failing = vi.fn(async () => {
      throw new ProviderError('test', 'provider', 500);
    });
    vi.setSystemTime(START + 90_000);
    await expect(gate.request('k', failing, { ttlMs: 60_000, staleMs: 60_000 })).resolves.toMatchObject({ data: 'old', stale: true });
    await vi.runAllTimersAsync();
    vi.setSystemTime(START + 130_000);
    await expect(gate.request('k', failing, { ttlMs: 60_000, staleMs: 60_000 })).rejects.toMatchObject({ issue: 'provider' });
  });

  it('never caches a failure', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    const failing = vi.fn(async () => {
      throw new ProviderError('test', 'network');
    });
    await expect(gate.request('k', failing, { ttlMs: 60_000 })).rejects.toBeInstanceOf(ProviderError);
    await expect(gate.request('k', answer(5), { ttlMs: 60_000 })).resolves.toMatchObject({ data: 5 });
  });
});

describe('RequestGate budget', () => {
  it('sends no more than the per-minute budget, then the rest as the window frees up', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 3 });
    const fetcher = answer(0);
    const done: number[] = [];
    const all = [0, 1, 2, 3, 4].map((i) => gate.request(`k${i}`, fetcher, { ttlMs: 60_000 }).then(() => done.push(i)));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetcher).toHaveBeenCalledTimes(5);
    await Promise.all(all);
    expect(done).toHaveLength(5);
  });

  it('keeps to the per-second budget too', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 100, perSecond: 2 });
    const fetcher = answer(0);
    [0, 1, 2, 3].forEach((i) => gate.request(`k${i}`, fetcher, { ttlMs: 60_000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('lets what someone is looking at go before background refreshes', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 1 });
    const order: string[] = [];
    const named = (name: string) => async () => {
      order.push(name);
      return { data: name };
    };
    gate.request('first', named('first'), { ttlMs: 60_000 });
    gate.request('bg', named('bg'), { ttlMs: 60_000, priority: 'background' });
    gate.request('page', named('page'), { ttlMs: 60_000, priority: 'interactive' });
    await vi.advanceTimersByTimeAsync(130_000);
    expect(order).toEqual(['first', 'page', 'bg']);
  });

  it('stops waiting after waitMs with "busy", but the request still lands in the cache', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 1 });
    await gate.request('a', answer('a'), { ttlMs: 600_000 });
    const fetcher = answer('b');
    const waiting = gate.request('b', fetcher, { ttlMs: 600_000, waitMs: 2000 });
    const result = expect(waiting).rejects.toMatchObject({ issue: 'busy' });
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(gate.peek('b')).toMatchObject({ data: 'b' });
  });

  it('pauses after the provider answers 429 instead of retrying into it', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 100, cooldownMs: 30_000 });
    await expect(
      gate.request('a', async () => {
        throw new ProviderError('test', 'rate-limit', 429);
      }, { ttlMs: 60_000 })
    ).rejects.toMatchObject({ issue: 'rate-limit' });
    const fetcher = answer('ok');
    const later = gate.request('b', fetcher, { ttlMs: 60_000 });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(gate.usage().pausedUntil).toBe(START + 30_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(later).resolves.toMatchObject({ data: 'ok' });
    expect(gate.usage().failures).toEqual({ 'rate-limit': 1 });
  });

  it('counts a slow call from when its answer lands, so the next minute cannot overlap it at the provider', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 1 });
    const slow = vi.fn(() => new Promise<{ data: number }>((resolve) => setTimeout(() => resolve({ data: 1 }), 20_000)));
    gate.request('slow', slow, { ttlMs: 600_000 });
    const next = answer(2);
    gate.request('next', next, { ttlMs: 600_000 });
    await vi.advanceTimersByTimeAsync(70_000);
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('recognises a provider error made by another bundle\'s copy of the class', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 100, cooldownMs: 30_000 });
    // What `instanceof` can't see: same shape, different class
    const foreign = Object.assign(new Error('finnhub request failed'), { isProviderError: true, provider: 'finnhub', issue: 'rate-limit', status: 429 });
    await expect(gate.request('a', async () => { throw foreign; }, { ttlMs: 60_000 })).rejects.toBe(foreign);
    expect(gate.usage().failures).toEqual({ 'rate-limit': 1 });
    expect(gate.usage().pausedUntil).toBe(START + 30_000);
  });

  it('counts usage for the diagnostics page', async () => {
    const gate = new RequestGate({ name: 'test', perMinute: 10 });
    await gate.request('a', answer(1), { ttlMs: 60_000 });
    await gate.request('a', answer(1), { ttlMs: 60_000 });
    expect(gate.usage()).toMatchObject({ sent: 1, lastMinute: 1, lastHour: 1, memoryHits: 1, queued: 0 });
    vi.setSystemTime(START + 61_000);
    expect(gate.usage()).toMatchObject({ lastMinute: 0, lastHour: 1 });
  });
});

describe('RequestGate slow store', () => {
  const memoryStore = () => {
    const rows = new Map<string, { data: unknown; fetchedAt: number }>();
    const store: SlowStore = {
      read: vi.fn(async (key: string) => rows.get(key) ?? null),
      write: vi.fn(async (key: string, data: unknown, fetchedAt: number) => {
        rows.set(key, { data, fetchedAt });
      }),
    };
    return { rows, store };
  };

  it('answers from the store after a restart without calling the provider', async () => {
    const { store } = memoryStore();
    const before = new RequestGate({ name: 'test', perMinute: 10, store });
    await before.request('profile', answer({ name: 'Apple' }), { ttlMs: 86_400_000, persist: true });
    const fetcher = answer({ name: 'changed' });
    const after = new RequestGate({ name: 'test', perMinute: 10, store });
    await expect(after.request('profile', fetcher, { ttlMs: 86_400_000, persist: true })).resolves.toMatchObject({ data: { name: 'Apple' }, from: 'store' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refetches once the stored copy is past its fresh time, and falls back to it when that fails', async () => {
    const { rows, store } = memoryStore();
    rows.set('profile', { data: 'stored', fetchedAt: START - 2 * 86_400_000 });
    const gate = new RequestGate({ name: 'test', perMinute: 10, store });
    const failing = vi.fn(async () => {
      throw new ProviderError('test', 'network');
    });
    await expect(gate.request('profile', failing, { ttlMs: 86_400_000, staleMs: 7 * 86_400_000, persist: true })).resolves.toMatchObject({ data: 'stored', stale: true });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('works without the store when the database fails', async () => {
    const store: SlowStore = {
      read: async () => {
        throw new Error('down');
      },
      write: async () => {
        throw new Error('down');
      },
    };
    const gate = new RequestGate({ name: 'test', perMinute: 10, store });
    await expect(gate.request('k', answer(3), { ttlMs: 1000, persist: true })).resolves.toMatchObject({ data: 3, from: 'provider' });
  });
});
