// The request gate every market-data provider call goes through (see lib/providers/registry.ts for the providers).
// It keeps the app inside each provider's free-plan limits however many pages, tabs or refreshes ask at once:
//   - a sliding-window budget per provider (calls per minute and per second), with callers queued by priority
//   - a memory cache with stale-while-revalidate: a fresh answer is reused, a stale one is shown while a new one loads
//   - identical requests already in flight are merged into one
//   - an optional slower store (MongoDB) for answers that change slowly, so they survive restarts and deploys
//   - a pause after the provider says "too many requests", instead of retrying into it
//   - usage counts for the diagnostics page
// No server or browser APIs here, so the unit tests drive it with a fake clock.

import type { FeedIssue } from "@/lib/market-data";

export type Priority = "interactive" | "background";

// A failed provider call, with the reason the page shows. The message never includes a URL (they can carry keys).
export class ProviderError extends Error {
    // Next bundles each route separately and the gate is shared between them through globalThis, so an error made by
    // one bundle's copy of this class fails `instanceof` in another's. This mark is what providerError() checks.
    readonly isProviderError = true;

    constructor(
        readonly provider: string,
        readonly issue: FeedIssue,
        readonly status?: number
    ) {
        super(`${provider} request failed: ${issue}${status ? ` (HTTP ${status})` : ""}`);
        this.name = "ProviderError";
    }
}

// The error as a ProviderError, whichever bundle made it
export const providerError = (error: unknown): ProviderError | undefined =>
    error instanceof Error && (error as Partial<ProviderError>).isProviderError === true ? (error as ProviderError) : undefined;

export const issueOf = (error: unknown): FeedIssue => providerError(error)?.issue ?? "network";

// What a fetcher returns: the answer and when the provider sent it (its Date header), when known
export type Fetched<T> = { data: T; fetchedAt?: number };

// What the gate returns: the answer, when it was fetched, and where it came from
export type Served<T> = {
    data: T;
    fetchedAt: number;
    // memory or store: a cached copy; provider: fetched for this call
    from: "memory" | "store" | "provider";
    // A cached copy past its fresh time, shown while a new one loads (or while the provider is failing)
    stale: boolean;
};

// Slow answers (profiles, ratios, daily history) kept outside this process. Reads and writes may fail; the gate
// carries on without the store when they do.
export interface SlowStore {
    read(key: string): Promise<{ data: unknown; fetchedAt: number } | null>;
    write(key: string, data: unknown, fetchedAt: number, keepUntil: number): Promise<void>;
}

export type RequestOptions = {
    // How long an answer counts as fresh
    ttlMs: number;
    // How much longer a stale answer may still be shown, while refreshing or while the provider fails
    staleMs?: number;
    priority?: Priority;
    // Keep the answer in the slow store too
    persist?: boolean;
    // How long this caller waits for a free slot in the budget; the request itself stays queued (and fills the
    // cache for the next caller) up to the gate's longest queue time
    waitMs?: number;
};

export type GateOptions = {
    name: string;
    // The provider's limits, set a little below the published ones
    perMinute: number;
    perSecond?: number;
    // Pause after a 429 when the provider doesn't say how long
    cooldownMs?: number;
    // A queued request older than this is dropped
    maxQueueMs?: number;
    maxEntries?: number;
    now?: () => number;
    store?: SlowStore;
};

type Entry = { data: unknown; fetchedAt: number; freshUntil: number; keepUntil: number };
type Waiter = { priority: Priority; queuedAt: number; resolve: () => void; reject: (error: unknown) => void };

const MINUTE = 60_000;
const SECOND = 1000;

export type GateUsage = {
    name: string;
    perMinute: number;
    // Calls sent to the provider in the last minute and hour, and since the server started
    lastMinute: number;
    lastHour: number;
    sent: number;
    // Answers served from the memory cache, from the slow store, stale while refreshing, and merged with a call already in flight
    memoryHits: number;
    storeHits: number;
    staleServed: number;
    merged: number;
    // Calls that failed, by reason, and callers that gave up waiting for the budget
    failures: Partial<Record<FeedIssue, number>>;
    timedOut: number;
    queued: number;
    pausedUntil?: number;
    lastError?: { issue: FeedIssue; status?: number; at: number };
    cached: number;
};

// How long one call to a provider may take, answer included. A stalled connection otherwise holds its gate slot,
// and any page waiting on it, until the operating system gives up minutes later.
export const PROVIDER_TIMEOUT_MS = 10_000;

export class RequestGate {
    readonly name: string;
    private readonly perMinute: number;
    private readonly perSecond: number;
    private readonly cooldownMs: number;
    private readonly maxQueueMs: number;
    private readonly maxEntries: number;
    private readonly now: () => number;
    private readonly store?: SlowStore;

    private readonly cache = new Map<string, Entry>();
    private readonly inFlight = new Map<string, Promise<Served<unknown>>>();
    private readonly queue: Waiter[] = [];
    // When each call to the provider went out, oldest first (the last hour's, for the usage counts)
    private readonly sentAt: number[] = [];
    // Calls handed a slot whose answer hasn't come back. They count against the budget until it does, and then from
    // the moment it did: the provider saw the call somewhere in between, and counting from the later time keeps a
    // slow or delayed call from letting the next minute's calls overlap it in the provider's window.
    private inFlightSlots = 0;
    private pausedUntil = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    private counts = { sent: 0, memoryHits: 0, storeHits: 0, staleServed: 0, merged: 0, timedOut: 0 };
    private failures: Partial<Record<FeedIssue, number>> = {};
    private lastError?: GateUsage["lastError"];

    constructor(options: GateOptions) {
        this.name = options.name;
        this.perMinute = options.perMinute;
        this.perSecond = options.perSecond ?? Infinity;
        this.cooldownMs = options.cooldownMs ?? 30_000;
        this.maxQueueMs = options.maxQueueMs ?? 3 * MINUTE;
        this.maxEntries = options.maxEntries ?? 5000;
        this.now = options.now ?? Date.now;
        this.store = options.store;
    }

    // An answer for `key`: cached when fresh, otherwise fetched within the budget. A stale copy is returned at once
    // while a new one loads in the background. Throws a ProviderError when there's nothing usable.
    async request<T>(key: string, fetcher: () => Promise<Fetched<T>>, options: RequestOptions): Promise<Served<T>> {
        const now = this.now();
        const entry = this.cache.get(key);
        if (entry && now < entry.freshUntil) {
            this.counts.memoryHits++;
            return { data: entry.data as T, fetchedAt: entry.fetchedAt, from: "memory", stale: false };
        }
        if (entry && now < entry.keepUntil) {
            this.counts.staleServed++;
            this.refreshInBackground(key, fetcher, options);
            return { data: entry.data as T, fetchedAt: entry.fetchedAt, from: "memory", stale: true };
        }

        const running = this.inFlight.get(key);
        if (running) {
            this.counts.merged++;
            return this.waitFor(running as Promise<Served<T>>, options.waitMs);
        }

        const load = this.load(key, fetcher, options);
        return this.waitFor(load, options.waitMs);
    }

    // Answers already cached, without asking the provider (for pages that only show what's on hand)
    peek<T>(key: string): Served<T> | undefined {
        const entry = this.cache.get(key);
        if (!entry || this.now() >= entry.keepUntil) return undefined;
        return { data: entry.data as T, fetchedAt: entry.fetchedAt, from: "memory", stale: this.now() >= entry.freshUntil };
    }

    usage(): GateUsage {
        const now = this.now();
        this.trim(now);
        return {
            name: this.name,
            perMinute: this.perMinute,
            lastMinute: this.sentAt.filter((at) => now - at < MINUTE).length + this.inFlightSlots,
            lastHour: this.sentAt.length + this.inFlightSlots,
            ...this.counts,
            failures: { ...this.failures },
            queued: this.queue.length,
            pausedUntil: this.pausedUntil > now ? this.pausedUntil : undefined,
            lastError: this.lastError,
            cached: this.cache.size,
        };
    }

    // ---------- loading ----------

    // Loads an answer: from the slow store when it has a usable copy, otherwise from the provider within the budget.
    // A stale stored copy is returned at once and refreshed in the background, like a stale memory copy.
    private load<T>(key: string, fetcher: () => Promise<Fetched<T>>, options: RequestOptions, useStore = true): Promise<Served<T>> {
        let refreshAfter = false;
        const promise = (async (): Promise<Served<T>> => {
            const stored = useStore && options.persist ? await this.readStore(key, options) : undefined;
            if (stored) {
                refreshAfter = stored.stale;
                return stored as Served<T>;
            }
            await this.acquire(options.priority ?? "interactive");
            const fetched = await this.sendCounted(fetcher);
            return this.keep(key, fetched, options);
        })();
        this.inFlight.set(key, promise as Promise<Served<unknown>>);
        const settle = () => {
            if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
            if (refreshAfter) this.refreshInBackground(key, fetcher, options);
        };
        promise.then(settle, settle);
        return promise;
    }

    private refreshInBackground<T>(key: string, fetcher: () => Promise<Fetched<T>>, options: RequestOptions) {
        if (this.inFlight.has(key)) return;
        // Failures are counted in send(); the stale copy stays until its keep time runs out
        this.load(key, fetcher, { ...options, priority: "background" }, false).catch(() => {});
    }

    private async readStore(key: string, options: RequestOptions): Promise<Served<unknown> | undefined> {
        if (!this.store) return undefined;
        try {
            const stored = await this.store.read(key);
            if (!stored) return undefined;
            const now = this.now();
            const freshUntil = stored.fetchedAt + options.ttlMs;
            const keepUntil = freshUntil + (options.staleMs ?? 0);
            if (now >= keepUntil) return undefined;
            this.counts.storeHits++;
            this.remember(key, { data: stored.data, fetchedAt: stored.fetchedAt, freshUntil, keepUntil });
            return { data: stored.data, fetchedAt: stored.fetchedAt, from: "store", stale: now >= freshUntil };
        } catch {
            return undefined;
        }
    }

    private keep<T>(key: string, fetched: Fetched<T>, options: RequestOptions): Served<T> {
        const now = this.now();
        // The provider's clock decides the answer's age, but never a time in our future
        const fetchedAt = Math.min(fetched.fetchedAt ?? now, now);
        const freshUntil = now + options.ttlMs;
        const keepUntil = freshUntil + (options.staleMs ?? 0);
        this.remember(key, { data: fetched.data, fetchedAt, freshUntil, keepUntil });
        if (options.persist && this.store) this.store.write(key, fetched.data, fetchedAt, keepUntil).catch(() => {});
        return { data: fetched.data, fetchedAt, from: "provider", stale: false };
    }

    private remember(key: string, entry: Entry) {
        this.cache.delete(key);
        this.cache.set(key, entry);
        // The oldest entries go first once the cache is full
        while (this.cache.size > this.maxEntries) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
    }

    private async send<T>(fetcher: () => Promise<Fetched<T>>): Promise<Fetched<T>> {
        this.counts.sent++;
        try {
            return await fetcher();
        } finally {
            this.inFlightSlots--;
            this.sentAt.push(this.now());
            this.pump();
        }
    }

    // A call through send(), counting its failure
    private async sendCounted<T>(fetcher: () => Promise<Fetched<T>>): Promise<Fetched<T>> {
        try {
            return await this.send(fetcher);
        } catch (error) {
            const issue = issueOf(error);
            const status = providerError(error)?.status;
            this.failures[issue] = (this.failures[issue] ?? 0) + 1;
            this.lastError = { issue, status, at: this.now() };
            if (issue === "rate-limit") this.pause(this.cooldownMs);
            throw error;
        }
    }

    // A caller stops waiting after waitMs; the request carries on and fills the cache
    private waitFor<T>(promise: Promise<T>, waitMs?: number): Promise<T> {
        if (waitMs === undefined) return promise;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.counts.timedOut++;
                reject(new ProviderError(this.name, "busy"));
            }, waitMs);
            promise.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }

    // ---------- the budget ----------

    // Stops sending for a while (after a 429)
    pause(ms: number) {
        this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
        this.schedule();
    }

    private acquire(priority: Priority): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queue.push({ priority, queuedAt: this.now(), resolve, reject });
            this.pump();
        });
    }

    private trim(now: number) {
        while (this.sentAt.length && now - this.sentAt[0] >= 60 * MINUTE) this.sentAt.shift();
    }

    // How long until another call fits in the budget: 0 when one fits now, Infinity when only a call still waiting on
    // its answer can free a slot (send() checks again when the answer lands)
    private waitForSlot(now: number): number {
        if (now < this.pausedUntil) return this.pausedUntil - now;
        this.trim(now);
        const minute = this.slotWait(now, MINUTE, this.perMinute);
        return minute > 0 ? minute : this.slotWait(now, SECOND, this.perSecond);
    }

    // For one window: the calls in it are those in flight plus those answered within it, and the answered ones leave
    // it oldest first
    private slotWait(now: number, windowMs: number, limit: number): number {
        let answered = 0;
        while (answered < this.sentAt.length && now - this.sentAt[this.sentAt.length - 1 - answered] < windowMs) answered++;
        // How many calls must leave the window, less one, before another fits
        const over = this.inFlightSlots + answered - limit;
        if (over < 0) return 0;
        if (over >= answered) return Infinity;
        return Math.max(1, this.sentAt[this.sentAt.length - answered + over] + windowMs - now);
    }

    private pump() {
        const now = this.now();
        // Callers that waited too long give up, so a long outage doesn't pile up work
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const waiter = this.queue[i];
            if (now - waiter.queuedAt > this.maxQueueMs) {
                this.queue.splice(i, 1);
                this.counts.timedOut++;
                waiter.reject(new ProviderError(this.name, "busy"));
            }
        }
        while (this.queue.length && this.waitForSlot(this.now()) === 0) {
            // What someone is looking at goes before background refreshes
            const index = this.queue.findIndex((waiter) => waiter.priority === "interactive");
            const [waiter] = this.queue.splice(index >= 0 ? index : 0, 1);
            // The slot is counted from the moment it's handed out, so the next check sees it
            this.inFlightSlots++;
            waiter.resolve();
        }
        this.schedule();
    }

    private schedule() {
        if (this.timer || !this.queue.length) return;
        const wait = this.waitForSlot(this.now());
        // An answer landing frees the slot then, and send() pumps the queue
        if (wait === Infinity) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.pump();
        }, Math.max(wait, 1));
    }
}
