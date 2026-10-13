@AGENTS.md

# Loops Watch: engineering rules

Loops Watch is a private, owner-only stock research workstation (Next 16, React 19, Better Auth, MongoDB, Finnhub,
optional Alpaca, TradingView embeds). Architecture and where things live: [docs/architecture.md](docs/architecture.md).
Data sources and their limits: [docs/heatmap.md](docs/heatmap.md). Specialist skills are in `.claude/skills/`.

## Financial data

- Never fabricate, estimate or fill in financial data. A missing value shows "—" and is counted; mock data is only
  for tests and previews and is never presented as live.
- Keep each value's provider timestamp and source. Show times in New York time with the session.
- Distinguish live, delayed and stale data in the UI (`quoteFreshness` in `lib/market-data.ts`). Delayed sources
  (TradingView, Alpaca SIP) are labeled delayed.
- Calculations are deterministic, tested code: simple returns `(p1 − p0) / p0`, explicit start prices, raw vs
  adjusted stated, OHLCV bars keyed by UTC start time and grouped by New York session. No AI inference for routine
  financial calculations.
- Backtests: no look-ahead, survivorship noted, costs included, out-of-sample split, assumptions reported.

## APIs, keys and cost

- Provider keys live in `.env` (never committed) and are read only on the server. They never reach the browser,
  logs, error messages or URLs the page can see.
- Budget every new request against the provider's rate limit (Finnhub free 60/min, Alpaca free 200/min) and cache it.
- Free first: no paid provider, plan or dependency without the owner's decision. Finnhub's free plan is personal
  use, so access stays limited to `ALLOWED_EMAILS`.

## Engineering

- Preserve working features. Change only what the task needs; keep existing behavior and URLs.
- Pure rules (parsing, windows, math) go in modules with no server or browser APIs, with unit tests in `tests/`.
- UX: premium black/white workstation, green/red only for gains and losses, both themes, keyboard and screen
  reader support, no layout shift. Never set CSS `color-scheme: dark`.
- Performance: cache server fetches, limit concurrency, memoize derived data, keep the React Compiler lint clean.
- Before calling work done: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, and a Playwright check
  against mock data for UI changes. Real-provider behavior is unverified until the owner runs `npm run check:*`.

## Workflow

- One branch and one pull request per feature. The owner merges and deploys; never merge, deploy or change
  production settings.
- The owner works on Windows (PowerShell, VS Code) and is learning: give exact commands, and warn that
  `npm install` can leave `package-lock.json` changes that block `git checkout`.
- Search the repo for what a task needs (`rg`, targeted reads) instead of loading whole directories. Keep
  `docs/architecture.md` current when the structure changes.
