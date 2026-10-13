# Final polish report (2026-10-13)

Branch `loops-watch-final-polish`, opened as one pull request against `main`. Nothing was merged or deployed.

## Recovery checkpoint

`main` before this work was commit `f77bcc9`. A copy of it is saved on GitHub as the branch
`loops-watch-pre-final-autopilot-backup`. A tag `loops-watch-pre-final-autopilot` exists only in Claude's copy: the
cloud environment refused to push tags. The checkpoint holds only tracked files, so no `.env` or keys are in it.

To go back to it on your computer (PowerShell, in the project folder, with `npm run dev` stopped):

```
git fetch origin
git checkout -b restore-checkpoint origin/loops-watch-pre-final-autopilot-backup
npm install
```

That gives you the old app on a new branch without touching `main`. If you ever want `main` itself back at the
checkpoint, ask Claude first: it means rewriting `main` on GitHub.

## What changed

| Area | Change |
|---|---|
| Workspaces (new page, `/workspace`) | Mosaic-style grid: drag by the title bar, resize from the corner, add and remove widgets, keyboard menu (move earlier or later, wider, narrower, taller, shorter). Up to 12 saved workspaces with tabs; rename, duplicate, reset to template, delete with confirmation. Templates: Market Overview, Technical Analysis, Company Research. One linked symbol per workspace; each widget can follow it or keep its own. Watchlist rows and Market Snapshot tiles load a symbol. Saved to MongoDB per user (800 ms after changes settle) with a browser copy when the database can't be reached. Phones get one column with no dragging. |
| Widgets | Finnhub: quote, company news, watchlist, Market Snapshot, sector funds, index funds. TradingView: chart, technical analysis, profile, financials, headlines, economic calendar, screener, market overview. |
| Stock pages | ETFs and funds are recognised (`lib/instrument.ts`): the header reads "SPY · NYSE Arca · ETF", key figures are price figures only (no P/E or market cap for a fund), and the profile panel is "Fund profile" with no financials panel. Chart, news, profile, technical analysis and financials sit in framed panels. The TradingView Advanced Chart is unchanged apart from filling its panel and a Full screen button that uses the browser's Fullscreen API on our own container. |
| Pages | Every section page (Markets, Market overview, News, Watchlist) uses the same page header and framed panels, with a tab title. News adds TradingView's US economic calendar (high and medium importance). |
| Header | Six menu tabs (Workspace added) fit beside the search box from 1024 px up, checked at every width to 1700 px. |
| Sign-in and sign-up | The tutorial's dashboard screenshot is replaced by a short list of what the app does. The side panel hides below 1024 px so the form comes first on phones. |
| Labels | Dashboard "Market data" panel says TradingView quotes may be delayed. |
| Security | Next.js 16.3.1 → 16.3.8 (fixes published advisories, including remote code execution on Windows dev servers and image-optimizer issues). `shadcn` moved to dev dependencies. |
| Docs | README and `docs/architecture.md` cover workspaces and the new files. |

## Feature checklist

| Feature | State |
|---|---|
| Dashboard: index funds, 54-stock Market Snapshot, sector funds, TradingView overview, headlines, market data | Done, unchanged data paths |
| S&P 500 Heatmap page (TradingView map) | Done, unchanged |
| Workspaces: grid, templates, saved layouts, linked symbol, reset | Done |
| Stock and ETF research pages | Done |
| Full-screen chart and map | Done |
| Search (Ctrl+K), watchlist, Data status page | Done, unchanged |
| Economic calendar | Done (TradingView embed) |
| Screener | TradingView's screener on Markets and as a widget; no screener on our own data |
| Economic indicators from FRED | Not built: needs a free FRED key you haven't added |
| Several watchlists | Not built: one watchlist per user |
| Portfolio analytics and backtesting | Not built: needs free daily price history. Finnhub's candles are a paid feature, and no free source is wired in yet |
| Saved chart drawings and indicators | Not possible: TradingView's free embed has no way to save them, and the page says so |

## Bugs fixed

- Your local build error (conflict markers in `lib/heatmap-state.ts`) came from pulling while on the old
  `heatmap-snapshot` branch; `main` itself was clean. Fixed by the commands sent in the thread.
- ETF pages showed company-only figures as "—" (P/E, market cap, EPS) and called the fund a company.
- The header's tabs overlapped the search box around 1280 px once a sixth tab was added.
- On phones, list widgets (index funds) were clipped inside a fixed-height box.
- The chart's fixed pixel size left gaps on wide screens; it now fills its panel.

## Test results

All run on this branch's final commit:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass, no warnings |
| `npm test` | 178 of 178 pass (15 files; 25 new for workspaces and fund detection) |
| `npm run build` | Pass |
| `npm audit --omit=dev` | 0 vulnerabilities (dev-only `shadcn` CLI advisories remain; they don't ship) |
| Browser, workspaces (mock prices) | 33 of 33: tabs, linking, bad symbols, drag, resize, no overlaps, add and remove, keyboard moves, rename, duplicate, delete, saved state, reload restores layout and symbol, reset, snapshot tile loads a symbol, phone layout, database-unavailable fallback, no console errors |
| Browser, pages (mock prices) | 38 of 38: stock and ETF figures, panels, full screen in and out, calendar, watchlist, both themes |
| Screenshot tour | 13 routes × desktop and phone × dark and light: no console errors (only the intended 404 page), no sideways scrolling |

Browser checks use a mock Finnhub with made-up prices. TradingView embeds can't load in Claude's environment, so they
show their "didn't load" message in the screenshots; on your computer they load from TradingView.

## Finnhub usage

Measured against the mock with the real 50-per-minute budget turned on:

- Dashboard on a cold server: 50 calls in the first minute (the budget), then the queue fills the rest of the
  Market Snapshot over the next minute, as before this work.
- Workspace after the dashboard: no extra calls beyond the queued Snapshot fill and the sector funds. A workspace
  reload: 0 calls.
- A stock page: 2 calls the first time, 0 on reload.
- No 60-second window went over 50 calls.

Workspace widgets read the same server cache as the rest of the app, load once per symbol, and never poll. The
browser never sees the Finnhub key: `lib/finnhub.ts` is server-only and no bundle contains the key or the Finnhub
address.

## Limitations and outside dependencies

- TradingView widgets are delayed, use TradingView's own data and can't be verified here.
- Real-provider behaviour is unverified until you run the checks below with your key during market hours.
- Free Finnhub is personal use only; access stays limited to `ALLOWED_EMAILS`.
- Email links still use `BETTER_AUTH_URL`; set it to the real address when you deploy.

## Production readiness

Ready for your review and a local run. Before deploying:

1. `npm install` (Next.js and the new grid library changed `package-lock.json`).
2. `npm run dev`, sign in, and try `/workspace`, a stock page and an ETF page (for example `/stocks/SPY`).
3. During market hours, open Data status from the account menu and confirm calls stay under 50 per minute; run
   `npm run check:market-data` and `npm run check:stream`.
4. Merge the pull request yourself, then deploy.
