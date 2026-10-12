# Heatmaps: where every figure comes from

Loops Watch has two heatmaps. This page records what each one shows, where the numbers come from, how they're
calculated, how old they can be, and what the app does when data is missing. Read it before changing either map.

## The two maps

| | Dashboard map, and the Heatmap page's **Interactive** view | Heatmap page's **Full S&P 500** view |
|---|---|---|
| Stocks | 54 of the largest S&P 500 companies in each GICS sector, 3 to 8 per sector (`lib/data/heatmap.ts`, ranked 2026-10-09) | Every S&P 500 constituent, as TradingView lists them |
| Drawn by | Our own code (`components/StockHeatmap.tsx`) | TradingView's stock heatmap widget, a sealed frame from tradingview.com |
| Prices | Finnhub, through our server | TradingView, delayed |
| Color | 1-day change only | 1H, 4H, 1D, 1W, 1M, 3M, 6M, YTD, 1Y, pre-market, after hours (TradingView's calculations) |
| Size | Market cap, or equal | Market cap, equal, volume, dollar volume (TradingView's figures) |
| Sectors | GICS, matching the Sector ETFs list | FactSet's 20 sectors (for example GOOGL is "Technology Services") |
| Hover, select, sector focus | Yes | TradingView's own hover card only; the page can't see inside the frame |

The interactive view only offers what our data can back. The other periods, extended hours and volume sizing stay
visible but disabled, and choosing one explains why and offers the Full S&P 500 view.

## Data sources

All Finnhub calls happen on the server (`lib/finnhub.ts`, marked `server-only`); the API key never reaches the
browser, and error messages and logs never include request URLs.

| Figure | Source | Notes |
|---|---|---|
| Price, previous close, open, day high and low | Finnhub `/quote` (`c`, `pc`, `o`, `h`, `l`) | A price of 0 means "no quote" (Finnhub's answer for an unknown symbol) and is never shown as $0. A high below the low is dropped. |
| Price time | Finnhub `/quote` `t` (seconds) | Not in Finnhub's published schema. Observed: the last update during the session, 4:00 PM ET after the close. A time more than 5 minutes in the future is ignored. |
| When we received it | The `Date` header of Finnhub's answer | Kept with the cached answer, so it stays true after caching. Shown as "received" in the selected-stock panel. |
| 1-day change | Calculated: `price − previous close`, and that ÷ previous close × 100 | So the dollar and percent figures always agree. Finnhub's own `d`/`dp` are used only when the previous close is missing. Relative to the previous regular-session close, unadjusted, as Finnhub reports it. |
| Market cap | Finnhub `/stock/profile2` `marketCapitalization` | US dollar millions, updated daily by Finnhub, cached for 24 hours. Left out (never converted or guessed) if the profile's currency isn't USD. |
| Name, exchange, logo | Finnhub `/stock/profile2` | Only `https` logos are shown. A missing or broken logo leaves the ticker on its own. |
| Which listing a profile is for | `/stock/profile2` `ticker` | Finnhub answers BRK.B with BRK.A's profile (seen with real data, 2026-10-11). Only company-wide figures (name, logo, exchange, total market cap) come from a profile, so another share class's is used; a different company's is ignored, and that stock is listed as having no market cap. |
| Sector and industry | GICS, from `lib/data/sp500.ts` | A copy of [datasets/s-and-p-500-companies](https://github.com/datasets/s-and-p-500-companies) (sourced from Wikipedia, public domain), 503 listings. Refresh it by copying the CSV again. |
| Market session | Finnhub `/stock/market-status` (the header's live prices), falling back to the New York clock | The fallback doesn't know holidays or early closes. |
| Sector ETF moves | Finnhub `/quote` for XLK, XLF, XLV, XLY, XLC, XLI, XLP, XLE, XLU, XLRE, XLB | |

### What Finnhub's free plan doesn't have

No price history (`/stock/candle` is a paid endpoint), no pre-market or after-hours prices, no trading volume on
`/quote`, no batch quotes. That is why the interactive map offers only the 1-day change and sizing by market cap or
equally; the other periods, extended hours and volume aren't shown there at all (the Full S&P 500 view has them). A
link that asks the interactive view for one of them gets the 1-day change by market cap, with a note saying so.
Free real-time data for the whole market doesn't exist elsewhere either: the exchanges charge for it, so free plans
are 15 minutes delayed (Alpaca, checked 2026-10-12) or cover one exchange. `/stock/metric` has period returns, but without an as-of date, so the app doesn't use them.

### Requests, caching and refresh

- Each stock needs two requests (quote and profile). On a cache miss at most 4 stocks are fetched at once, so at
  most 8 requests are in flight. Next refreshes expired cache entries in the background (it serves the old answer
  straight away), and those background refreshes are not limited by this, so a page view after a long idle spell
  can send most of the ~108 requests at once.
- Prices are cached on the server for 2 to 3¼ minutes, staggered so they don't all expire together. Profiles are
  cached for a day. Next's data cache only keeps successful answers, so a failed refresh leaves the last good one.
- The page asks `/api/heatmap` (a plain GET for signed-in users) every minute while the tab is visible. The first
  ask comes a minute after the page's prices were made, which is straight away when they're older (going Back shows
  the page with the prices it had). After a failure it waits 2, 4, then 5 minutes; the first success goes back to
  every minute. A 401 stops it.
- A cold cache costs about 108 requests, more than the free plan's 60 a minute. Finnhub then answers some with 429,
  those stocks show as missing, and the status line says "Finnhub's rate limit was hit". They fill in on the next
  refreshes as the cache warms.

### Live trades

During the regular session the map also follows Finnhub's free trade stream (`wss://ws.finnhub.io`), so the largest
stocks move within a second or two of each trade instead of once a minute.

- **Key stays on the server.** `GET /api/heatmap/stream` (signed-in users only) opens the socket to Finnhub with the
  key and passes trades on to the page as server-sent events. The page never sees the key.
- **50 symbols.** The free stream allows 50 symbols, so the 50 largest map stocks by market cap stream; the other 4
  keep the once-a-minute refresh. `npm run check:stream` checks the limit and the connection with your key.
- **Batches.** The server sends at most two batches a second, with only each stock's newest trade, since the busiest
  stocks trade hundreds of times a second.
- **Regular session only.** Only trades between 9:30 AM and 4:00 PM ET move a tile, since the 1-day change is a
  regular-session figure (Finnhub's quote is too). A trade only replaces a price it is newer than and from the same
  New York day; a stock waits for its first refresh of the day, which brings the previous close the change needs.
  The page doesn't open the stream outside the regular session or while the tab is hidden.
- **Refreshes don't undo it.** A refresh can bring a price cached on the server a minute or two ago; the page keeps
  whichever price is newer.
- **Connections.** Each connection lasts about 4½ minutes (inside Vercel's 5-minute limit for one request on the
  free plan) and the page opens the next straight away. If the stream fails (Finnhub refuses a second stream on the
  same key, the server's Node.js is older than 22, the connection drops), the status line says "Live stream off ·
  updating every minute" and the page tries again after 30 seconds, then 1, 2 and 5 minutes.
- **Status line.** "Live" with a pulsing dot while trades stream in; hovering it says how many stocks stream.

## Colors

One function, `tileBackground` in `lib/heatmap.ts`, colors every tile and the legend on both maps of ours:

- Moves smaller than ±0.05% are flat gray.
- Above that, the tile mixes from gray toward green (up) or red (down) in proportion to the move, in OKLab, reaching
  the full color at ±3%. Bigger moves stay at the full color, so one outlier can't wash out the rest of the map.
- The legend shows the same mix from ≤ −3% to ≥ +3%, with a mark at every whole percent.
- The colors are CSS variables in `app/globals.css` (`--heat-flat`, `--heat-up`, `--heat-down`), one set per theme.
  **Display → Blue / orange** swaps in a palette for red-green color blindness; the scale doesn't change.
- White tile text passes WCAG's 4.5:1 contrast on every shade of every palette. `tests/heatmap-colors.test.ts`
  reads the colors from `globals.css` and checks it at 1% steps, so a palette change that breaks it fails the tests.
- Stale and missing tiles get dark diagonal stripes (black at 30% and 26%). Dark stripes can only add contrast to the
  white text, and the same test checks the striped shades and that the stripes stand out from the tile under them.

TradingView's map uses TradingView's own scale, which the page can't change.

## Freshness

Every stock on our maps is **fresh**, **stale** or **missing** (`quoteFreshness` in `lib/market-data.ts`):

- **Missing:** no usable quote. The tile is gray with wide dark stripes and "—".
- **Stale:** no price time; or during the regular session, older than 15 minutes; or more than 30 minutes behind the
  newest price on the map; or, with the market closed, older than 4 days. The tile keeps its color with thin
  dark stripes, and the hover card and panel say "Stale".
- The status line under the map gives the period, how many stocks are priced, how many are stale, any stocks left
  off the map because they have no market cap (named in full; more than 4 sit behind a "not drawn" disclosure), the
  newest price time, and the source.
- The period is "1D · Today" only when the newest price on the map is from today in New York. Otherwise it is
  "1D · Last session (Fri, Oct 9)": before the open, on weekends and holidays, and also after the open until today's
  first prices arrive. Each tile's screen-reader label says "today" or "on Fri, Oct 9" from that stock's own price
  time, and the hover card and panel give the price's day as well as its time when it isn't today, so a stale stock
  never claims today's move.
- The map's combined move (above the map) counts current prices only and says how many stale stocks it left out.
- When refreshing fails, the status line says so ("Refresh failing since 10:42 AM ET; showing the last prices
  received") and the map keeps the last prices with their own times, so they turn stale honestly.
- Nothing calls these prices real-time. Finnhub doesn't state a delay for its free plan's US quotes; the app shows
  each price's own time instead.

## Sectors

- Our maps and the Sector ETFs list both use the 11 GICS sectors. `SECTOR_ETFS` in `lib/data/markets.ts` maps each
  to its Select Sector SPDR fund (a unit test checks all 11 are covered once).
- The list shows two different figures, labelled separately:
  - **ETF:** the fund's own 1-day move. The funds hold every company in the sector and cap their biggest holdings.
  - **Leaders:** the market-cap-weighted 1-day move of the interactive map's stocks in that sector,
    Σ(cap × change) ÷ Σ cap, over current prices only, with how many stocks counted and how many were stale.
- An ETF whose own price is stale shows its figure in gray with "Stale" in place of the bar, and is left out of the
  "up / down" count.
- The rows keep their order while the pointer or keyboard focus is in the list, so a refresh can't move a row out
  from under the cursor; they re-sort when you leave.
- TradingView's map uses FactSet's sectors, which don't line up with GICS, so the list can't link to it. Choosing a
  sector there switches to the interactive view.

## Interaction

- **Hover** (or arrow keys): a small card with the quote, market cap, sector and price time. It follows the cursor
  without covering it, stays inside the window, and is moved outside React so following the mouse costs no render.
- **Click, Enter or Space** (Heatmap page): selects the stock. Its panel stays beside the map on wide screens, or
  opens as a sheet on tablets and phones (focus moves into it, and Esc returns to the tile). The selected tile keeps
  a heavy outline. Hovering never replaces the selection. On the dashboard a click opens the stock's page.
- **Sector focus:** a sector heading, a Sector ETFs row, or the panel's focus button shows only that sector;
  "All sectors" goes back. Pointing at a row spotlights its sector on the map.
- The view, period, size, grouping, sector and selected stock live in the address bar, so Back from a stock's page
  returns to the same view. The page reads them back from the address bar on Back and Forward, and its first
  refresh fetches new prices straight away when the restored ones are more than a minute old.
- Keyboard: the map is one Tab stop; arrow keys move between stocks, and the selected tile is marked
  `aria-current`. Sector headings are 24px tall on the maps where they can be clicked (WCAG 2.5.8 target size) and
  are reachable by mouse and screen readers; keyboard users focus sectors from the list or the panel's crosshair,
  which is a toggle (pressed while that sector is focused). Controls that disappear when used hand focus back to the
  map instead of dropping it to the page.

## Performance

The map is plain positioned elements. Tiles are memoized one by one (compared by value, so a refresh only redraws
the tiles whose figures changed), the tile layer as a whole skips re-rendering while the cursor moves, and the hover
card moves by `transform` at most once per frame. Measured on 2026-10-11 (Chromium, production build, mock prices):

- 400 hover moves over the 54-stock map: about 300–350 ms of script and no long tasks. The same sweep on the build
  before this work, run alternately on the same machine, took 594 ms of script and 472 ms of layout (now 345 and 120).
- A refresh that changes every price: about 54 ms of script, no long tasks.
- All 503 S&P 500 stocks: hover 370 ms of script with no long tasks; a refresh makes two ~62 ms tasks. A canvas
  rewrite wasn't justified.
- Ten trips between the dashboard and this page, and an hour of refreshes: DOM nodes and listeners stay constant and
  the heap stays around 7–8 MB.

## Licensing (release blocker for a public app)

- **Finnhub:** every self-serve plan, including the free one, is listed as "Personal Use", and its terms forbid
  sharing data or derived results with anyone without written approval. Fine for a personal app; showing the prices
  to other users needs Finnhub's approval, a commercial plan, or another provider.
- **TradingView:** widgets must keep TradingView's attribution line as designed. Every widget in the app has it
  (`hooks/useTradingViewWidget.ts`), and the app's styles don't change it.

## Checking it

- `npm test`: unit tests for quote normalization, sessions and freshness, the color scale and contrast, treemap
  layout, label fitting, card placement, arrow keys, URL state and the sector mapping.
- `npm run check:stream`: connects to Finnhub's trade stream with your key, subscribes to 50 symbols and reports
  whether Finnhub accepted it and how many trades arrived in 20 seconds (none outside market hours is normal).
- `npm run check:market-data`: checks the real Finnhub answers for every map stock and sector ETF with your key
  (pacing itself under the rate limit, never printing the key) and prints PASS, PASS WITH WARNINGS or FAIL.
