# Handoff (read this first)

The state of Loops Watch for whoever picks up the next task, human or Claude. Keep it short and current: update
the "Status" and "Next" sections in the same pull request as any feature. Details live in the linked docs, not here.

Last updated: 2026-10-14, after the deploy (PR #29), with the daily chart pull request.

## Read only what the task needs

| For | Read |
|---|---|
| Rules (data accuracy, keys, cost, UX, workflow) | `CLAUDE.md` |
| Where code lives, data flow, library decisions | `docs/architecture.md` |
| Provider limits and request budget | `.claude/skills/market-data-engineer/providers.md`, `docs/heatmap.md` |
| Workspaces, ETF pages, checkpoint, usage numbers | `docs/final-polish.md` |
| Watchlists (lists, grid, storage, loading) | `docs/watchlist-redesign.md` |
| Specialist checklists | `.claude/skills/*/SKILL.md` (data engineer, quant, UX, data QA) |
| Deploying (Vercel, Atlas, Inngest, env vars) | `docs/deploy.md` |

## Status

- `main` = `4da0480` (PRs #25 to #29 merged). Live on Vercel at https://loops-watch.vercel.app; every merge to `main`
  deploys. Everything below "Done" is on `main`.
- Recovery checkpoint: branch `loops-watch-pre-final-autopilot-backup` (old `main`, `f77bcc9`); restore steps in
  `docs/final-polish.md`. Never delete it.
- In review: daily chart on stock pages (branch `claude/project-thread-j8jqtv`). The stock page's Chart panel gets a
  "TradingView | Daily" switch (TradingView stays the default; the choice, range, style and averages are remembered in
  the browser). "Daily" draws Alpaca's adjusted daily bars since 2016 with Lightweight Charts 5.2.1 (Apache 2.0, keeps
  its TradingView attribution logo): candles or close line, volume, 50/200-session simple moving averages, 3M to Max
  ranges, keyboard reading (arrow keys, Home/End, Esc). Same cached history as the Portfolio page (`/api/chart`,
  `getDailyHistory`): 1 Alpaca call per symbol a day at most, only when the daily chart is opened, no polling.
  Browser check on mock data: `dev-harness/chart-check.mjs` 22/22.

### Done

- Auth (Better Auth), owner-only access via `ALLOWED_EMAILS`, welcome and daily news emails (Inngest, Gemini text).
- Header: tabs, search (Ctrl+K), looping price ticker, session and New York clock.
- Dashboard: index funds, 54-stock Market Snapshot (Finnhub, live trades in session), sector funds,
  TradingView panels (the Market news panel is in review, below).
- S&P 500 Heatmap page (TradingView map only), Markets page (TradingView screener for all US
  stocks, native screener for your watchlists, saved presets; PR #26).
- Stock and ETF pages: Finnhub quote, key figures, company news; TradingView chart, profile, financials.
- Workspaces: drag/resize grid, templates, several saved layouts, linked symbol (`/workspace`).
- Watchlists: several named lists, sortable/configurable grid, details panel, phone cards (`/watchlist`).
- Request gate: shared Finnhub budget (50/min), memory + MongoDB cache, freshness labels, Data status page.
- Economy page: US indicators from FRED (PR #27; needs `FRED_API_KEY`, check with `npm run check:fred`).
- News page, Dashboard Market news panel, upcoming events (PR #25, details below).
- Deploy: Vercel production with Atlas and Inngest (PR #29, `docs/deploy.md`).
- Portfolio page: target-weight backtests on Alpaca free daily bars (PR #28; `lib/backtest.ts`, `lib/portfolio.ts`,
  `lib/daily-bars.ts`, `lib/alpaca.ts`; Alpaca gate 180/min, 1 call per symbol per day; needs the Alpaca keys, check
  with `npm run check:portfolio`).

### News (`/top-stories`, Dashboard, stock pages), PR #25

- One shared Finnhub news system (`lib/news-data.ts`): market + M&A headlines (2 calls, reused 10 minutes) feed the
  News page, the Dashboard's Market news panel (8 newest, at most 2 M&A) and the workspace widget; company news
  (1 call per symbol, past week, reused 30 minutes) feeds the watchlist tab, stock pages and the workspace widget.
  Measured on mock data: Dashboard 2 calls, then News page 0, watchlist tab 1 per symbol, then that stock's page 0.
- News page tabs: All, Markets, M&A, My watchlists, Earnings (calendar), Economic calendar (TradingView, full width,
  importance and economies settings), Saved. Search, order, row height, bookmarks and settings saved per user
  (MongoDB `news_prefs`); 15-minute refresh only while visible.
- Side panel: upcoming events (FOMC, Fed governors' speeches and testimony, Beige Book, CPI, jobs, PPI, GDP, PCE) from
  the free Federal Reserve, BLS and BEA schedules; New York times; no forecasts (the calendar tab has those).
  Real sources unverified until the owner runs `npm run check:events`.
- Status line never calls an old copy new: a copy past 10 minutes reads "refreshing" and the page picks up the new one;
  older than 30 minutes reads "last updated".
- Not built (no free tagged source): Economy and Sectors news categories, earnings headlines as a category.

## Decisions to keep

- $0 running cost: free Finnhub (personal use, so owner-only), TradingView embeds, MongoDB Atlas free, Vercel.
- TradingView embeds stay as provided (no iframe styling hacks); keep their attribution line.
- Never fabricate or estimate figures; missing shows "—"; every price shows source and age.
- Dashboard Market Snapshot stays 54 stocks; no full 503-stock map on our data.
- Real time is not required everywhere; minimize calls; no polling while a tab is hidden.
- Out of scope: order execution, Level II, tick streaming for all stocks, paid data, own charting engine.

## Provider limits (summary)

Finnhub free: 60 calls/min (we budget 50), 1 WebSocket, 50 streamed symbols, no candles, economic calendar paid,
company news US only, earnings calendar about a month. TradingView: delayed, unreadable by the page. Details:
`providers.md`.

## Tests

- Unit: `npm test` (Vitest, `tests/`), 311 passing.
- Static: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Browser (mock data, cloud only): preview harness in the shared project folder `dev-harness/` (see its README).
  On the News branch: pages 38/38, watchlist 48/48, workspace 33/33, ticker all pass, news 32/32 plus 5 failure cases, events 19/19, integration 21/21 plus
  2 failure cases.
- Real provider: owner runs `npm run check:market-data` and `npm run check:stream` in market hours, and
  `npm run check:events` (any time). Still unverified.

## Next (priority order)

1. Owner checks in market hours: `npm run check:market-data`, `npm run check:stream`; Data status stays under
   50 calls/min. Any time: `npm run check:events`, `npm run check:fred`, `npm run check:portfolio` (the last one also
   covers the daily chart's data).
2. Owner reviews and merges the daily chart pull request, then opens a stock page on the live site, picks "Daily" and
   checks the chart against a known recent close (the bars are adjusted, so old prices differ from what traded then).
3. Possible follow-ups, only if wanted: the daily chart as a workspace widget; more indicators (each as tested pure
   code in `lib/price-chart.ts`).

## Working efficiently (for Claude threads)

- One feature per thread and per PR. Start a thread by reading this file and only the docs and files the task names.
- Search (`rg`) and read line ranges; don't read whole directories or re-read files already summarized here.
- During work: run the unit tests for the changed module and the one browser check for the changed page. Before the
  PR: the full list in `CLAUDE.md`.
- Screenshots: only of changed screens, once at the end (plus a phone width); don't re-capture unchanged pages.
- Don't repeat provider research recorded in `providers.md`; update that file when something new is learned.
- Use cheaper models (or subagents) for routine edits, copy changes and searches; keep the strongest model for data
  correctness, security, request budgeting and architecture.
- End every PR by updating "Status" and "Next" above.
