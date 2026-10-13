import 'server-only';

import { RequestGate, type GateUsage } from '@/lib/providers/gate';
import { mongoSlowStore } from '@/lib/providers/mongo-store';

// One gate per provider for the whole server process, shared by every page, route and tab. Kept on globalThis so
// a code reload in development doesn't start a second gate with a fresh budget.
//
// Budgets sit a little under each free plan's limit (see .claude/skills/market-data-engineer/providers.md):
//   Finnhub: about 60 calls a minute (widely cited; its pricing page couldn't be read), 30 a second documented
//   Alpaca:  200 calls a minute on the free Basic plan
// On Vercel each running server instance has its own gate, so two busy instances could together pass a budget;
// the slow store keeps that rare by sharing the expensive answers.

export type ProviderName = 'finnhub' | 'alpaca';

const BUDGETS: Record<ProviderName, { perMinute: number; perSecond: number }> = {
  finnhub: { perMinute: 55, perSecond: 20 },
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
