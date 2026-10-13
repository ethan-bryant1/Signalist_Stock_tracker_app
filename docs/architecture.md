# Architecture notes

A short map for whoever works on Loops Watch next. Keep it current when the structure changes.

## Where things live

| Area | Files |
|---|---|
| Pages | `app/(root)/` (dashboard `page.tsx`, `heatmap`, `market-data`, `market-overview`, `top-stories`, `watchlist`, `stocks/[symbol]`), `app/(auth)/` (sign in/up) |
| API routes | `app/api/market` (index and sector fund prices), `app/api/heatmap` (map data), `app/api/heatmap/stream` (live trades as server-sent events), `app/api/inngest` |
| Request gate (every provider call) | `lib/providers/gate.ts` (budget, cache, merging, usage; pure), `lib/providers/registry.ts` (one gate per provider), `lib/providers/mongo-store.ts` (slow answers kept in MongoDB) |
| Provider clients (server only) | `lib/finnhub.ts`, `lib/alpaca.ts`, `lib/finnhub-stream.ts` + `lib/stream-hub.ts` (one shared Finnhub socket) |
| Data assembly (server only) | `lib/stock-data.ts` (quotes, overviews, news, market strip), `lib/heatmap-data.ts` (the map) |
| Browser-callable actions | `lib/actions/finnhub.actions.ts` (search and its quote preview only, signed-in) |
| Pure rules (tested) | `lib/market-data.ts` (quotes, sessions, freshness), `lib/price-stamp.ts` (source and age labels), `lib/period-change.ts`, `lib/alpaca-data.ts`, `lib/live-trades.ts`, `lib/treemap.ts`, `lib/heatmap-state.ts` |
| Diagnostics | `app/(root)/status` (Data status page: calls per minute, cache share, failures, stream) |
| Static data | `lib/data/sp500.ts` (GICS list), `lib/data/heatmap.ts` (map universe), `lib/data/markets.ts` (ETFs) |
| Auth | `lib/better-auth/auth.ts`, `lib/owner-access.ts` (`ALLOWED_EMAILS`), `proxy.ts` (Next 16 middleware) |
| Email jobs | `lib/inngest/` (welcome and daily news emails; Gemini writes the text only) |
| Checks | `tests/` (Vitest), `scripts/check-*.mjs` (real-provider checks with the owner's keys) |

## Data flow

Every Finnhub and Alpaca REST call goes through that provider's gate (`lib/providers/registry.ts`):

- **Budget.** A sliding one-minute window set under the free plan (Finnhub 50/min and 20/s, Alpaca 180/min). Callers
  queue; what someone is looking at goes before background refreshes. A call holds its slot until its answer lands and
  is counted from then, so a slow call can't let the next minute's calls overlap it at the provider. Each call gives up
  after 10 s. A 429 pauses the provider for 30 s.
- **Cache.** One memory cache per server process, with stale-while-revalidate: a stale copy is shown at once while a new
  one loads, and stays usable while the provider fails, until its keep time. Identical requests in flight are merged.
  Profiles and key ratios are also kept in MongoDB (`provider_cache`, deleted by a TTL index) so restarts and deploys
  don't fetch them again. Next's own data cache is not used for provider calls: it keys on the URL (with the key in it)
  and is skipped in development whenever the browser sends no-cache headers.
- **Waiting.** Pages wait a few seconds at most (`waitMs`, which every page-facing call must set); a request still
  queued keeps going and fills the cache for the next refresh. A figure that didn't arrive in time is reported as `busy`, a real provider 429 as `rate-limit`.

Pages call `lib/stock-data.ts` and `lib/heatmap-data.ts` after checking the session. The header strip refreshes once a
minute from `/api/market` (one poller, in the layout; `<IncludeSectorPrices>` adds the sector funds on pages that show
them). The heatmap refreshes from `/api/heatmap`, stops while its TradingView view is showing, and during trading
sessions follows `/api/heatmap/stream`; every open tab shares the server's one Finnhub socket, since Finnhub allows one
connection per key. Every price shows its source and age (`components/PriceStamp.tsx`). TradingView widgets are
separate, delayed embeds.

## Libraries

Evaluated 2026-10-13. Add one only when a feature needs it.

| Library | Decision |
|---|---|
| Playwright | Use for browser checks. It is preinstalled in Claude's cloud environment; add `@playwright/test` as a dev dependency when browser tests move into the repo. |
| TradingView Lightweight Charts | Add when the app draws its own price charts (Alpaca bars). Free, Apache-2.0, ~45 kB. |
| SQLite | Not used: Vercel's disk doesn't persist between requests. MongoDB (Atlas free, 512 MB) keeps slow provider answers (`provider_cache`) and will keep daily bars. |
| Indicator library | Not yet: no indicators are computed. Write simple ones in `lib/` with tests; revisit for a full set. |
| React Grid Layout | Not yet: no user-arranged panels. Revisit if the dashboard becomes customizable. |
| NumPy, pandas, SciPy, statsmodels, Backtrader | Not in the app: it runs as Next.js on Vercel. Revisit only for an offline research or backtesting tool kept apart from the app. |

## Development and cost

- Claude's development usage (this repo's work) is separate from the app's API usage (the owner's Finnhub and
  Alpaca keys at runtime). The app makes no AI calls for market data; Gemini only writes email text.
- Deterministic checks (`npm test`, `npm run check:*`) verify figures; don't ask a model to recompute them.
