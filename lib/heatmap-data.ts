import 'server-only';

import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { SP500_COMPANIES } from '@/lib/data/sp500';
import { FINNHUB_CACHE, finnhubGet, getFinnhubToken, worstIssue } from '@/lib/finnhub';
import { issueOf } from '@/lib/providers/gate';
import { marketTtlMs, normalizeQuote, sameCompany, sameListing, type FeedIssue, type HeatmapPayload, type HeatmapStock } from '@/lib/market-data';
import { parseFinnhubStats, periodStarts, statsAnchor } from '@/lib/period-change';
import { getAlpacaExtras } from '@/lib/alpaca';

const SP500_BY_SYMBOL = new Map(SP500_COMPANIES.map((company) => [company.symbol, company]));

type FinnhubProfile = { name?: string; ticker?: string; logo?: string; exchange?: string; marketCapitalization?: number; currency?: string };

// Finnhub's exchange name (like "NASDAQ NMS - GLOBAL MARKET") as the short name traders know
const shortExchange = (exchange?: string) => {
  const name = exchange?.toUpperCase() ?? '';
  if (name.includes('NASDAQ')) return 'NASDAQ';
  if (name.includes('NYSE MKT') || name.includes('AMERICAN')) return 'NYSE American';
  if (name.includes('ARCA')) return 'NYSE Arca';
  if (name.includes('NEW YORK STOCK EXCHANGE') || name === 'NYSE') return 'NYSE';
  if (name.includes('CBOE') || name.includes('BATS')) return 'Cboe';
  return undefined;
};

// In the regular session prices are reused for about 5 minutes (4½ to 5½, staggered so they expire a few at a time);
// the live stream moves the largest stocks between refreshes. Once the closing prices are in, quotes are kept until
// the next open (see marketTtlMs). Company profiles (name, logo, market cap) and stats come from FINNHUB_CACHE
// (a day and 6 hours, kept in MongoDB).
const QUOTE_MS = (index: number, now: number) => marketTtlMs(now, (270 + (index % 5) * 15) * 1000);
// The cache keeps serving the last good stats while Finnhub fails. Past this age (by the answer's Date header) they
// may be measured to an older close than the anchor assumes, so they're dropped and the longer periods read "—".
const STATS_MAX_AGE_MS = 30 * 60 * 60_000;
// The page waits this long for figures; anything still queued for Finnhub's budget keeps loading in the background
// and arrives with the next refresh, so an empty cache never holds the page for minutes
const WAIT_MS = 3000;
// The interactive heatmaps' data: every stock in the universe with its latest Finnhub quote and profile.
// Shared by everyone through the Finnhub gate's cache, so viewers and tabs don't add Finnhub requests.
// Stocks whose figures fail to load are still returned, without them, so the page can say which are missing.
// Only call this for a signed-in viewer (the dashboard and Heatmap pages, and /api/heatmap, check).
export async function getHeatmapData(): Promise<HeatmapPayload> {
  const generatedAt = Date.now();
  const token = getFinnhubToken();
  const base = HEATMAP_SYMBOLS.map((symbol): HeatmapStock => {
    const company = SP500_BY_SYMBOL.get(symbol);
    return { symbol, name: company?.name ?? symbol, sector: company?.sector ?? 'Information Technology', industry: company?.industry ?? '' };
  });

  if (!token) {
    console.error('getHeatmapData: FINNHUB_API_KEY is not configured');
    return { provider: 'Finnhub', stocks: base, generatedAt, failedRequests: 0, issue: 'not-configured' };
  }

  const issues: FeedIssue[] = [];
  const failed = (error: unknown) => {
    issues.push(issueOf(error));
    return null;
  };

  let statsFailed = 0;
  const stocks = await Promise.all(base.map(async (stock, index): Promise<HeatmapStock> => {
    const symbol = { symbol: stock.symbol };
    const [quote, profile, stats] = await Promise.all([
      finnhubGet<unknown>('/quote', symbol, { ...FINNHUB_CACHE.quote, ttlMs: QUOTE_MS(index, generatedAt), waitMs: WAIT_MS }).catch(failed),
      // The map is sized by the profile's market cap, so it loads with the prices rather than behind them
      finnhubGet<FinnhubProfile>('/stock/profile2', symbol, { ...FINNHUB_CACHE.profile, priority: 'interactive', waitMs: WAIT_MS }).catch(failed),
      // A missing stat only hides that stock's longer-period change, so it isn't counted as a price failure
      finnhubGet<unknown>('/stock/metric', { ...symbol, metric: 'all' }, { ...FINNHUB_CACHE.metric, waitMs: WAIT_MS }).catch(() => {
        statsFailed++;
        return null;
      }),
    ]);

    const normalized = normalizeQuote(quote?.data, generatedAt);
    // Only company-wide figures come from the profile, so another share class's profile is fine (BRK.A's for BRK.B),
    // but a profile for a different company is ignored rather than shown under this ticker
    const p = profile?.data && (!profile.data.ticker || sameCompany(profile.data.ticker, stock.symbol)) ? profile.data : undefined;
    // Every S&P 500 listing trades in dollars. A profile in another currency would put its market cap in that
    // currency, so it is left out rather than shown as dollars.
    const capInDollars = !p?.currency || p.currency === 'USD';
    const cap = capInDollars && typeof p?.marketCapitalization === 'number' && Number.isFinite(p.marketCapitalization) && p.marketCapitalization > 0
      ? p.marketCapitalization
      : undefined;

    // Per-share stats from another share class's answer would be wrong for this one, so they need this exact listing
    const statsCurrent = !!stats && (stats.fetchedAt === undefined || generatedAt - stats.fetchedAt < STATS_MAX_AGE_MS);
    const ownStats = statsCurrent && stats?.data && typeof stats.data === 'object' && (!(stats.data as { symbol?: unknown }).symbol || sameListing(String((stats.data as { symbol?: unknown }).symbol), stock.symbol));
    const parsed = ownStats ? parseFinnhubStats(stats.data) : undefined;

    return {
      ...stock,
      name: p?.name || stock.name,
      exchange: shortExchange(p?.exchange),
      logo: p?.logo && /^https:\/\//.test(p.logo) ? p.logo : undefined,
      marketCap: cap,
      quote: normalized,
      fetchedAt: normalized ? quote?.fetchedAt : undefined,
      periodStart: parsed ? periodStarts(parsed, statsAnchor(normalized, generatedAt)) : undefined,
      averageVolume: parsed?.averageVolume,
    };
  }));

  // What Finnhub's free plan lacks (1H, 4H, 1M, extended hours, today's volume), from Alpaca when its keys are set
  const alpaca = await getAlpacaExtras(stocks, generatedAt);
  const withAlpaca = stocks.map((stock) => {
    const extra = alpaca.stocks.get(stock.symbol);
    if (!extra || (!extra.periodStart && !extra.todayVolume && !extra.extended)) return stock;
    return { ...stock, ...extra, periodStart: extra.periodStart ? { ...stock.periodStart, ...extra.periodStart } : stock.periodStart };
  });

  // One line instead of one per stock, without URLs (they carry the key)
  if (statsFailed) console.error(`getHeatmapData: ${statsFailed} Finnhub stats requests failed`);
  if (issues.length) console.error(`getHeatmapData: ${issues.length} Finnhub requests failed (${[...new Set(issues)].join(', ')})`);
  return { provider: 'Finnhub', stocks: withAlpaca, generatedAt, failedRequests: issues.length, issue: worstIssue(issues), alpaca: alpaca.status };
}
