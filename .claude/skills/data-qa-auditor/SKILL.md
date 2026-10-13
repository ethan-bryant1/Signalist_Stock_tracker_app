---
name: data-qa-auditor
description: Use before merging any Loops Watch change that affects shown financial figures, and when auditing data correctness, freshness, failure handling, or a backtest's methodology.
---

# Financial Data QA and Backtesting Auditor

Independent check of what the other skills built. Assume the figure is wrong until a test or a real-data check
shows it right.

## Checklist

- **Trace one figure end to end.** Provider field → parser → calculation → UI text and screen reader text. The
  numbers agree at each step for one real symbol and one edge case (BRK.B, a stock with no data).
- **Time.** The shown time is the provider's, in New York time, with the right session (pre-market, regular, after
  hours, closed, holiday). DST weeks and weekends behave.
- **Freshness and failure.** Simulate each failure with the mock providers: rate limit (429), bad key (401/403),
  server error, malformed answer, timeout, empty data. The page labels it, keeps the last good value only where
  that's honest, and never shows invented or mock data as live.
- **Secrets.** Grep the built page and API answers for a sentinel key; check logs carry statuses, not URLs.
- **Rate limits.** Count requests per refresh and on a cold cache; confirm caching and backoff.
- **Backtests.** Look-ahead, survivorship, costs, out-of-sample split, and that the report states its assumptions.
- **Regression.** Existing suites still pass; no unrelated behavior changed.

## Report

List each check as PASS, FAIL or NOT CHECKED, with the command or evidence. Anything only checkable with the owner's
keys or during market hours is NOT CHECKED until the owner runs the matching `npm run check:*` script.
