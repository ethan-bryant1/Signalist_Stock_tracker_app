# Architecture notes

A short map for whoever works on Loops Watch next. Keep it current when the structure changes.

## Where things live

| Area | Files |
|---|---|
| Pages | `app/(root)/` (dashboard `page.tsx`, `workspace`, `heatmap`, `market-data`, `market-overview`, `top-stories`, `watchlist`, `stocks/[symbol]`, `status`), `app/(auth)/` (sign in/up) |
| Workspaces | `components/workspace/` (`WorkspaceApp` grid and toolbar, `WidgetFrame`, `widgets.tsx` contents, `SymbolField`), `lib/workspace.ts` (catalog, templates, layout moves, validation; pure), `lib/actions/workspace.actions.ts` + `database/models/workspace.model.ts` (one saved store per user) |
| Watchlists | `components/watchlist/` (`WatchlistApp` page, `WatchlistGrid` quote grid also used by the workspace widget, `ListTabs`, `ColumnsMenu`, `InspectPanel`, `WatchCards` for phones, `useWatchRows`), `lib/watchlists.ts` (lists, columns, sorting, validation; pure), `lib/watchlist-format.ts` (cell text; pure), `lib/watchlist-store.ts` + `database/models/watchlist-lists.model.ts` (one document per user, migrated from the older `watchlists` collection, which is left as it was), `lib/watchlist-data.ts` (rows from the shared cache), `lib/actions/watchlist.actions.ts` |
| News | `components/news/` (`NewsCenter` page body, `NewsRow`/`NewsList` rows shared with stock pages and workspace widgets, `EarningsTable`, `UpcomingEvents` Fed and economic-data schedule panel), `lib/news.ts` (normalizing, de-duplicating, search, times, settings, bookmarks, earnings rows; pure), `lib/news-data.ts` (Finnhub market, M&A, company news and earnings calendar through the gate), `lib/events.ts` (Fed calendar and BLS/BEA iCalendar parsing, selection; pure) + `lib/events-data.ts` (fetches the three schedules through the gate), `lib/news-store.ts` + `database/models/news-prefs.model.ts` (settings and bookmarks per user), `lib/actions/news.actions.ts` |
| Shared UI | `components/Panel.tsx` (titled frame), `components/PageHeader.tsx`, `components/ToolButton.tsx` (tool and full-screen buttons), `hooks/useFullscreen.ts` |
| API routes | `app/api/market` (index and sector fund prices), `app/api/watchlist/rows` (watchlist grid figures; signed-in), `app/api/news` (market, watchlist and earnings feeds; signed-in), `app/api/heatmap` (map data), `app/api/heatmap/stream` (live trades as server-sent events), `app/api/inngest` |
| Request gate (every provider call) | `lib/providers/gate.ts` (budget, cache, merging, usage; pure), `lib/providers/registry.ts` (one gate per provider), `lib/providers/mongo-store.ts` (slow answers kept in MongoDB) |
| Provider clients (server only) | `lib/finnhub.ts`, `lib/finnhub-stream.ts` + `lib/stream-hub.ts` (one shared Finnhub socket) |
| Data assembly (server only) | `lib/stock-data.ts` (quotes, overviews, news, market strip), `lib/heatmap-data.ts` (the map) |
| Browser-callable actions | `lib/actions/finnhub.actions.ts` (search, its quote preview and the workspace's quote and news widgets; signed-in), `lib/actions/workspace.actions.ts` |
| Pure rules (tested) | `lib/market-data.ts` (quotes, sessions, freshness, cache times), `lib/watchlists.ts`, `lib/watchlist-format.ts`, `lib/market-calendar.ts` (exchange holidays and early closes), `lib/price-stamp.ts` (source and age labels), `lib/instrument.ts` (stock, fund or other, and the figures each lists), `lib/workspace.ts`, `lib/live-trades.ts`, `lib/treemap.ts`, `lib/heatmap-state.ts` |
| Diagnostics | `app/(root)/status` (Data status page: calls per minute, cache share, failures, stream) |
| Static data | `lib/data/sp500.ts` (GICS list), `lib/data/heatmap.ts` (map universe), `lib/data/markets.ts` (ETFs) |
| Auth | `lib/better-auth/auth.ts`, `lib/owner-access.ts` (`ALLOWED_EMAILS`), `proxy.ts` (Next 16 middleware) |
| Email jobs | `lib/inngest/` (welcome and daily news emails; Gemini writes the text only) |
| Checks | `tests/` (Vitest), `scripts/check-*.mjs` (real-provider checks with the owner's keys) |

## Data flow

Every Finnhub REST call goes through the provider's gate (`lib/providers/registry.ts`):

- **Budget.** A sliding one-minute window set under the free plan (Finnhub 50/min and 20/s; a new provider gets its own budget there). Callers
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
them). The dashboard's Market Snapshot refreshes from `/api/heatmap` and during the regular session follows
`/api/heatmap/stream`; every open tab shares the server's one Finnhub socket, since Finnhub allows one
connection per key. Every price shows its source and age (`components/PriceStamp.tsx`). TradingView widgets are
separate, delayed embeds; the S&P 500 Heatmap page (`components/SP500Heatmap.tsx`) is TradingView's map with our
toolbar and makes no Finnhub requests for the map.

Workspaces: the page loads the user's saved store on the server (`getWorkspaceStore`) and the browser saves changes
800 ms after they settle (`saveWorkspaceStore`), plus a copy in `localStorage` that takes over when the database
can't be reached. Every read and write goes through `parseStore`, which drops anything unknown or out of range.
Watchlists: the user's lists, the open list and the grid's columns, sort and row height are one MongoDB document
(`watchlist_lists`), written with a revision check so two tabs can't overwrite each other. The first load builds it from
the older one-stock-per-document `watchlists` collection and never deletes that. The star buttons (stock page, search)
act on the open list; the news email covers every list. The page applies a change at once, saves it with a server
action and undoes it if saving fails. Prices come with the page for the first 10 symbols, then from
`/api/watchlist/rows` in chunks of 40, each symbol once; Refresh and "Retry incomplete rows" are the only repeats (a row
with its price but missing key figures asks for the figures only). Lists over 10 symbols load key figures behind
prices.

News (`/top-stories`): market and M&A headlines come with the page (2 Finnhub calls, reused 10 minutes); company news for
watchlist symbols loads when its tab opens, 12 symbols per request (1 call per symbol, reused 30 minutes); the earnings
calendar is 1 call reused 6 hours. All are also kept in MongoDB. The open page asks again every 15 minutes only while
visible. Finnhub's economic calendar is paid, so the side panel lists upcoming events from free public schedules instead:
the Federal Reserve Board's calendar (FOMC, speeches, testimony, Beige Book) and the BLS and BEA release schedules
(major releases only), each fetched at most every 6 hours and kept in MongoDB. Times only, no forecasts.

Widgets that show Finnhub figures call the signed-in actions once per symbol through the shared cache (no polling);
the Market Snapshot widget reads `/api/heatmap`; TradingView widgets are embeds with their own data.

## Libraries

Evaluated 2026-10-13. Add one only when a feature needs it.

| Library | Decision |
|---|---|
| Playwright | Use for browser checks. It is preinstalled in Claude's cloud environment; add `@playwright/test` as a dev dependency when browser tests move into the repo. |
| TradingView Lightweight Charts | Add when the app draws its own price charts (Alpaca bars). Free, Apache-2.0, ~45 kB. |
| SQLite | Not used: Vercel's disk doesn't persist between requests. MongoDB (Atlas free, 512 MB) keeps slow provider answers (`provider_cache`) and will keep daily bars. |
| Indicator library | Not yet: no indicators are computed. Write simple ones in `lib/` with tests; revisit for a full set. |
| React Grid Layout | Used by the Workspace page (2.2.4, pinned): drag and resize only. Layout rules (compaction, moves, validation) are our own in `lib/workspace.ts` so they're tested without the library. Its stylesheet isn't imported; `globals.css` styles the grid in the app's grays. |
| NumPy, pandas, SciPy, statsmodels, Backtrader | Not in the app: it runs as Next.js on Vercel. Revisit only for an offline research or backtesting tool kept apart from the app. |

## Development and cost

- Claude's development usage (this repo's work) is separate from the app's API usage (the owner's Finnhub key
  at runtime). The app makes no AI calls for market data; Gemini only writes email text.
- Deterministic checks (`npm test`, `npm run check:*`) verify figures; don't ask a model to recompute them.
