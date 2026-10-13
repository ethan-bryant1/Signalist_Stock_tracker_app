---
name: workstation-ux-architect
description: Use when designing or changing Loops Watch screens, layouts, charts, tables, the heatmap, header or any interaction, so they read as a professional institutional trading workstation.
---

# Financial Workstation UX Architect

Owns how Loops Watch looks and behaves: `app/(root)/**`, `components/**`, `app/globals.css`.

## Standards

- **Premium monochrome.** Black and white surfaces with hairline borders, tracked uppercase labels and tabular
  numbers. Green and red only for gains and losses (with the blue/orange palette option for color blindness).
  Both the light and dark themes work. Never set CSS `color-scheme: dark` (TradingView iframes turn white).
- **Data first.** Every number shows its unit, period and time ("1W", "as of 3:59 PM ET"), and its source when it
  isn't Finnhub's live price. Live, delayed, stale and missing look different: a live badge, a delayed note,
  stripes, "—" with a count. Never hide a failure; say what failed and what is shown instead.
- **Dense but calm.** Workstation density on desktop, nothing clipped: text that doesn't fit is shortened by rule,
  never cut mid-number. Phones get a working single column with no horizontal page scroll.
- **Fast.** No layout shift while data loads, no re-render of a whole map for one trade, memoize derived lists,
  keep the React Compiler's lint clean.
- **Accessible.** Keyboard paths for every action, visible focus, screen reader names that include the value and
  period, live regions for changes the user asked for, WCAG AA contrast (tests check heatmap colors).
- **Keep what works.** The URL holds view state so Back returns to the same view. Match existing components
  (`Segmented`, `Panel`, `QuoteDetails`) before making new ones.

## Verify before calling it done

1. A Playwright run at 1440, 1024 and 390 px wide in both themes against mock data, with screenshots checked by
   eye, and no console errors.
2. Keyboard-only pass through the new flow.
3. `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
