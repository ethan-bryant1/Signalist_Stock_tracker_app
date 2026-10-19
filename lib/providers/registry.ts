import 'server-only';

import { RequestGate, type GateUsage } from '@/lib/providers/gate';
import { mongoSlowStore } from '@/lib/providers/mongo-store';

// One gate per provider for the whole server process, shared by every page, route and tab. Kept on globalThis so
// a code reload in development doesn't start a second gate with a fresh budget.
//
// Budgets sit a little under each free plan's limit (see docs/providers.md):
//   Finnhub: about 60 calls a minute (widely cited; its pricing page couldn't be read), 30 a second documented.
//            50 leaves room for the check scripts and anything else using the same key.
//   FRED:    120 calls a minute documented (fred.stlouisfed.org/docs/api/fred/errors.html); no per-second limit
//            published. The indicators page needs about 50 calls when nothing is cached, then a handful a day.
//   Federal Reserve, BLS, BEA: public schedule files, fetched a few times a day (lib/events-data.ts); a small
//            budget keeps any loop from hammering a government site.
//   Alpaca:  200 calls a minute on the free plan. Backtests ask for one symbol's daily history per call, kept a day.
// On Vercel each running server instance has its own gate, so two busy instances could together pass a budget;
// the slow store keeps that rare by sharing the expensive answers.

// Add a provider here (with its budget) when the app starts using one.
export type ProviderName = 'finnhub' | 'fred' | 'fed' | 'bls' | 'bea' | 'alpaca';

const BUDGETS: Record<ProviderName, { perMinute: number; perSecond: number }> = {
  finnhub: { perMinute: 50, perSecond: 20 },
  fred: { perMinute: 100, perSecond: 20 },
  fed: { perMinute: 4, perSecond: 1 },
  bls: { perMinute: 4, perSecond: 1 },
  bea: { perMinute: 4, perSecond: 1 },
  alpaca: { perMinute: 180, perSecond: 10 },
};

const gates = ((globalThis as { __loopsGates?: Map<ProviderName, RequestGate> }).__loopsGates ??= new Map());

export const gate = (provider: ProviderName): RequestGate => {
  let found = gates.get(provider);
  if (!found) {
    found = new RequestGate({ name: provider, ...BUDGETS[provider], store: mongoSlowStore() });
    gates.set(provider, found);
  }
  return found;
};

// Each provider's usage since this server process started, and the moment it was read
export const providerUsage = (): { now: number; usage: GateUsage[] } => ({
  now: Date.now(),
  usage: (Object.keys(BUDGETS) as ProviderName[]).map((provider) => gate(provider).usage()),
});

// When this server process started, so the diagnostics page can say what its counts cover
const started = ((globalThis as { __loopsStarted?: number }).__loopsStarted ??= Date.now());
export const processStartedAt = () => started;
