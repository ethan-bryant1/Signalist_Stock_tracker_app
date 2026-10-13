# Watchlist redesign (2026-10-13)

## Audit of the page before this change

| Area | What it was |
|---|---|
| Page | `app/(root)/watchlist/page.tsx`: one server-rendered table (`components/WatchlistTable.tsx`) with seven fixed columns: star, company, symbol, price, change %, market cap, P/E. No sorting, filtering, column choice or selection. On wide screens the table filled the width with a few rows and a lot of empty space. |
| Data model | MongoDB collection `watchlists` (`database/models/watchlist.model.ts`): one document per saved stock, `{ userId, symbol, company, addedAt }`, unique on `(userId, symbol)`. So one list per user, ordered by date added. |
| Add and remove | The star on a stock page (`WatchlistButton`) and the search window (`SearchCommand`) call `addToWatchlist` / `removeFromWatchlist`. The table's star removes a stock at once with no undo; the page then reloads its data. |
| Other users of the list | The daily news email (`getWatchlistSymbolsByEmail`), the stock page's star (`isStockInWatchlist`), the search window's stars and the workspace's Watchlist widget (`getWatchlistSymbols`). |
| Prices | `getWatchlistWithData` calls `getStockOverview` per stock: Finnhub quote (shared cache, 1 minute in the session), profile (1 day, also kept in MongoDB) and key metrics (6 hours, also in MongoDB), all through the shared call budget. Each price carries its time (`PriceStamp`). No polling. |
| Navigation | Clicking a row opens `/stocks/[symbol]`; the company name is a real link for keyboard users. |
| Styling | The app's gray scale tokens (`--color-gray-*`), green/red only for changes, both themes. The table used large rows and text with no tabular numbers, and numbers were left-aligned. |
| Phones | The table scrolled sideways; there was no compact layout. |
| Must keep | Adding from the stock page and the search window, the news email's symbols, price stamps, the shared cache and call budget, links to stock pages. |

Reference: IBKR Mosaic's watchlists are tabs of named lists over a dense quote grid. Columns are chosen and ordered per grid, any column sorts, rows reorder by hand, and selecting a row loads the instrument into linked windows. Loops Watch keeps those ideas and its own black-and-white look; nothing is copied.

## What changed

- **Several named lists** as tabs: create (+), rename (double-click or the ⋯ menu), delete (asks first; the last list
  can't be deleted), switch with a click or the arrow keys. A stock can be in several lists; a list holds it once.
  Up to 20 lists of 500 symbols.
- **Storage**: one MongoDB document per user (`watchlist_lists`) with the lists, the open list and the grid settings.
  Every write checks a revision number, so two tabs can't overwrite each other. The first visit builds it from the
  older `watchlists` collection (newest first, as before) and leaves that collection untouched.
- **Grid**: symbol plus chosen columns (name, last, change, change %, open, previous close, day low/high, 52-week
  low/high, market cap, P/E, EPS, dividend yield, 10-day average volume, industry, exchange, price time). Any heading
  sorts (numbers high to low first, missing figures always last); the choice, column order, row height and details
  panel are saved with the account. Headings and the symbol column stay in view while scrolling. A dash means Finnhub
  has no figure; "n/a" means the figure doesn't exist for a fund; a dash with a "didn't load" tooltip means the
  request failed or waited for the call budget.
- **Adding and removing**: type a ticker and press Add stock (checked with Finnhub first; duplicates, non-tickers and
  unknown symbols are refused with a message), or use the search window's star. Remove with the row's ×, the Delete
  key or the details panel; a toast offers Undo, which puts it back in the same place. A change shows at once and is
  undone with a message if saving fails.
- **Order**: drag a row by its handle or press Alt+↑/↓ (in list order with no filter).
- **Details panel** for the selected row: price with its time, day and 52-week range bars, key figures, other lists
  it's in, Open (the stock page), move and Remove. Beside the grid on wide screens, under it on tablets, and inside the
  tapped card on phones. No second TradingView chart.
- **Keyboard**: one tab stop for the grid; ↑/↓, Home/End select, Enter opens the stock page, Delete removes.
- **Phones**: cards with symbol, name, price and change, a sort picker, tap to open details.
- **Workspace**: the Watchlist widget now uses the same grid (price and change %); picking a row links the symbol.

## Data and API use

Rows come from the same `getStockOverview` and shared cache as the stock pages: quote 1 minute in the session,
profile 1 day and key figures 6 hours (both also kept in MongoDB). The page brings the first 10 rows with it; the
browser asks `/api/watchlist/rows` for the rest in chunks of 40, once per symbol. Nothing polls. Refresh asks again
(prices under a minute old come from the cache), and "Retry incomplete rows" asks again only for rows Finnhub didn't
fully answer, fetching just the key figures when the price is already there. Lists over 10 symbols load key figures
behind prices.

Measured on the preview with the real budget (50 calls a minute) and a cold 120-symbol list: the page showed in 3 s,
never more than 50 calls in any 60 s, a reload within the minute made 0 calls. A cold list needs about three calls
per symbol (quote, profile, key figures), so 120 new symbols take roughly 7 minutes to fill on Finnhub's free plan;
later visits only need the prices (profiles and figures are cached for a day and six hours).

## Checks (mock Finnhub, never real prices)

95 watchlist browser checks (interactions, persistence, 0/1/2/20/120 symbols, failed saves, database down, provider
errors, phone/tablet/desktop, both themes, workspace widget, console errors) plus the earlier workspace (33) and pages
(38) suites all pass. Unit tests: `tests/watchlists.test.ts`, `tests/watchlist-format.test.ts`.

## Limits

- Finnhub's free plan limits how fast a long, new list fills in (above). Real-provider behavior is unverified until
  the owner runs the app with their key.
- Columns are the figures Finnhub's free quote, profile and metric endpoints give; no intraday volume, bid/ask or
  extended-hours prices.
- Renaming a list doesn't rename it in other open tabs until they reload.
