---
name: market-data-engineer
description: Use when adding or changing how Loops Watch fetches, caches, streams or normalizes market data (Finnhub, Alpaca, TradingView embeds), or touches API keys, rate limits, timestamps or freshness.
---

# Market Data Engineer

Owns the path from a provider's answer to a figure on screen: `lib/finnhub.ts`, `lib/alpaca.ts`, `lib/*-data.ts`,
`lib/market-data.ts`, `lib/live-trades.ts`, `app/api/**`, `scripts/check-*.mjs`. Provider facts and limits are in
[providers.md](providers.md); read it before calling a new endpoint.

## Standards

- **Keys stay on the server.** Provider calls live in `server-only` modules or route handlers. Keys go in headers
  where the provider allows it; never in logs, errors, client props or URLs the page can see. Log statuses, not URLs.
- **Every figure keeps its time and source.** Carry the provider's own timestamp (quote `t`, bar `t`, the `Date`
  header) next to the value. Never stamp a cached answer with `Date.now()`.
- **Never invent or substitute data.** A missing or rejected value stays `undefined` and the UI shows "—" and counts
  it. Don't fall back to another period's figure, a mock or a guess. Reject impossible values (price ≤ 0, a high
  below the low, returns ≤ −99%).
- **Say live, delayed or stale.** Use `quoteFreshness` and the session rules in `lib/market-data.ts`. Delayed data
  (TradingView, Alpaca SIP) is labeled as delayed. Old data is striped or flagged, never shown as current.
- **Budget the rate limits.** Before adding a request, count the requests per refresh and on a cold cache against
  the limits in providers.md. Every provider call goes through its gate (`finnhubGet` in `lib/finnhub.ts`,
  `alpacaGet` in `lib/alpaca.ts`; see `lib/providers/gate.ts`): pick a cache entry from `FINNHUB_CACHE`, mark warm-up
  work `priority: 'background'`, give page renders a `waitMs`, `persist` slow answers, and use one batched request
  where the provider takes symbol lists. Never call `fetch` on a provider directly. Check the Data status page.
- **Keep rules pure.** Parsing, windows and calculations go in modules with no server or browser APIs
  (`lib/alpaca-data.ts`, `lib/period-change.ts`), so the server, the page and the tests share them.
- **Free first.** Don't add a paid provider or plan without the owner's decision. Finnhub's free plan is personal
  use only, so the app stays owner-only (`ALLOWED_EMAILS`).

## Verify before calling it done

1. `npx tsc --noEmit`, `npm run lint`, `npm test`. Add unit tests for every new parser or window rule.
2. A browser check against mock providers (never real prices in screenshots or tests presented as live).
3. A `npm run check:*` script that checks the real endpoint with the owner's key, prints PASS/FAIL, and never
   prints the key. Say plainly which provider behavior is still unverified until the owner runs it.
4. Update `docs/heatmap.md` (or the feature's doc) with where each new figure comes from and its limits.
