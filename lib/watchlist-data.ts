import 'server-only';

import { mapWithLimit } from '@/lib/finnhub';
import { getKeyFigures, getStockOverview } from '@/lib/stock-data';
import type { WatchFigures, WatchRow } from '@/lib/watchlists';

export const MAX_ROWS_PER_REQUEST = 200;
// Above this many symbols, a list's key figures (cached for hours) wait behind its prices
const METRICS_FIRST_UP_TO = 10;

// The grid's figures for each symbol, through the shared cache and call budget: a price is reused for a minute in the
// session, the profile for a day and the key figures for six hours, so reopening the page costs nothing new.
export const getWatchRows = async (symbols: readonly string[]): Promise<WatchRow[]> => {
  const metricPriority = symbols.length > METRICS_FIRST_UP_TO ? 'background' : 'interactive';
  return mapWithLimit(symbols.slice(0, MAX_ROWS_PER_REQUEST), 8, async (symbol): Promise<WatchRow> => {
    const o = await getStockOverview(symbol, { metricPriority });
    return {
      symbol: o.symbol,
      kind: o.kind,
      name: o.name,
      exchange: o.exchange,
      industry: o.industry,
      currency: o.currency,
      price: o.price,
      change: o.change,
      changePercent: o.changePercent,
      open: o.open,
      previousClose: o.previousClose,
      dayLow: o.dayLow,
      dayHigh: o.dayHigh,
      week52Low: o.week52Low,
      week52High: o.week52High,
      marketCap: o.marketCap,
      peRatio: o.peRatio,
      eps: o.eps,
      dividendYield: o.dividendYield,
      avgVolume: o.avgVolume,
      quoteTime: o.quoteTime,
      cached: o.cached,
      issue: o.issue,
      figuresIssue: o.metricIssue,
      checkedAt: o.checkedAt ?? Date.now(),
    };
  });
};

// Only the key figures, for rows that have their price but whose figures didn't load (a long list loads them after
// its prices). Asked for by a person, so they go ahead of background work, and no price is fetched again.
export const getWatchFigures = async (symbols: readonly string[]): Promise<WatchFigures[]> =>
  mapWithLimit(symbols.slice(0, MAX_ROWS_PER_REQUEST), 8, async (symbol): Promise<WatchFigures> => {
    const f = await getKeyFigures(symbol, 'interactive');
    return {
      symbol: symbol.toUpperCase(),
      week52Low: f.week52Low,
      week52High: f.week52High,
      peRatio: f.peRatio,
      eps: f.eps,
      dividendYield: f.dividendYield,
      avgVolume: f.avgVolume,
      figuresIssue: f.metricIssue,
    };
  });
