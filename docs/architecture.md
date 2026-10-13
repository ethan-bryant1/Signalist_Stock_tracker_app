# Architecture notes

A short map for whoever works on Loops Watch next. Keep it current when the structure changes.

## Where things live

| Area | Files |
|---|---|
| Pages | `app/(root)/` (dashboard `page.tsx`, `heatmap`, `market-data`, `market-overview`, `top-stories`, `watchlist`, `stocks/[symbol]`), `app/(auth)/` (sign in/up) |
| API routes | `app/api/heatmap` (map data), `app/api/heatmap/stream` (live trades as server-sent events), `app/api/inngest` |
| Provider clients (server only) | `lib/finnhub.ts`, `lib/alpaca.ts`, `lib/actions/finnhub.actions.ts` |
| Data assembly | `lib/heatmap-data.ts` (quotes, profiles, stats, Alpaca extras for the map) |
| Pure rules (tested) | `lib/market-data.ts` (quotes, sessions, freshness), `lib/period-change.ts`, `lib/alpaca-data.ts`, `lib/live-trades.ts`, `lib/treemap.ts`, `lib/heatmap-state.ts` |
| Static data | `lib/data/sp500.ts` (GICS list), `lib/data/heatmap.ts` (map universe), `lib/data/markets.ts` (ETFs) |
| Auth | `lib/better-auth/auth.ts`, `lib/owner-access.ts` (`ALLOWED_EMAILS`), `proxy.ts` (Next 16 middleware) |
| Email jobs | `lib/inngest/` (welcome and daily news emails; Gemini writes the text only) |
| Checks | `tests/` (Vitest), `scripts/check-*.mjs` (real-provider checks with the owner's keys) |

## Data flow

Server components and `/api/heatmap` call the provider clients, which cache answers in Next's data cache. The page
refreshes once a minute and, during trading sessions, follows `/api/heatmap/stream`, which relays Finnhub's trade
WebSocket so the key stays on the server. TradingView widgets are separate, delayed embeds.

## Libraries

Evaluated 2026-10-13. Add one only when a feature needs it.

| Library | Decision |
|---|---|
| Playwright | Use for browser checks. It is preinstalled in Claude's cloud environment; add `@playwright/test` as a dev dependency when browser tests move into the repo. |
| TradingView Lightweight Charts | Add when the app draws its own price charts (Alpaca bars). Free, Apache-2.0, ~45 kB. |
| SQLite | Not needed: MongoDB already stores users and watchlists; Next's cache holds provider answers. |
| Indicator library | Not yet: no indicators are computed. Write simple ones in `lib/` with tests; revisit for a full set. |
| React Grid Layout | Not yet: no user-arranged panels. Revisit if the dashboard becomes customizable. |
| NumPy, pandas, SciPy, statsmodels, Backtrader | Not in the app: it runs as Next.js on Vercel. Revisit only for an offline research or backtesting tool kept apart from the app. |

## Development and cost

- Claude's development usage (this repo's work) is separate from the app's API usage (the owner's Finnhub and
  Alpaca keys at runtime). The app makes no AI calls for market data; Gemini only writes email text.
- Deterministic checks (`npm test`, `npm run check:*`) verify figures; don't ask a model to recompute them.
