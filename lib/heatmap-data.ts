import 'server-only';

import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { SP500_COMPANIES } from '@/lib/data/sp500';
import { FINNHUB_BASE_URL, FinnhubError, fetchFinnhub, getFinnhubToken, mapWithLimit, worstIssue } from '@/lib/finnhub';
import { normalizeQuote, sameCompany, sameListing, type FeedIssue, type HeatmapPayload, type HeatmapStock } from '@/lib/market-data';
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

// Prices are cached for two to three minutes, staggered so they expire a few at a time rather than all at once.
// Company profiles (name, logo, market cap) change slowly and are cached for a day.
const QUOTE_SECONDS = (index: number) => 120 + (index % 6) * 15;
const PROFILE_SECONDS = 24 * 60 * 60;
// Company stats (period returns, average volume) are worked out from daily closes. They're cached for 6 to 8
// hours, staggered, so a recompute after the close reaches the map overnight and they don't all reload at once.
const STATS_SECONDS = (index: number) => 6 * 60 * 60 + (index % 8) * 15 * 60;
// The cache keeps serving the last good stats while Finnhub fails. Past this age (by the answer's Date header) they
// may be measured to an older close than the anchor assumes, so they're dropped and the longer periods read "—".
const STATS_MAX_AGE_MS = 30 * 60 * 60_000;
// Finnhub's free plan allows 60 requests a minute, so only a few go out at once
const CONCURRENCY = 4;

// The interactive heatmaps' data: every stock in the universe with its latest Finnhub quote and profile.
// Shared by everyone through Next's data cache, so viewers don't add Finnhub requests.
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
    issues.push(error instanceof FinnhubError ? error.issue : 'network');
    return null;
  };

  let statsFailed = 0;
  const stocks = await mapWithLimit(base, CONCURRENCY, async (stock, index): Promise<HeatmapStock> => {
    const q = encodeURIComponent(stock.symbol);
    const [quote, profile, stats] = await Promise.all([
      fetchFinnhub<unknown>(`${FINNHUB_BASE_URL}/quote?symbol=${q}&token=${token}`, QUOTE_SECONDS(index)).catch(failed),
      fetchFinnhub<FinnhubProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${q}&token=${token}`, PROFILE_SECONDS).catch(failed),
      // A missing stat only hides that stock's longer-period change, so it isn't counted as a price failure
      fetchFinnhub<unknown>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${q}&metric=all&token=${token}`, STATS_SECONDS(index)).catch(() => {
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
  });

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
