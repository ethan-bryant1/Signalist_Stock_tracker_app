import 'server-only';

import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { SP500_COMPANIES } from '@/lib/data/sp500';
import { FINNHUB_BASE_URL, FinnhubError, fetchFinnhub, getFinnhubToken, mapWithLimit, worstIssue } from '@/lib/finnhub';
import { normalizeQuote, type FeedIssue, type HeatmapPayload, type HeatmapStock } from '@/lib/market-data';

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

  const stocks = await mapWithLimit(base, CONCURRENCY, async (stock, index): Promise<HeatmapStock> => {
    const q = encodeURIComponent(stock.symbol);
    const [quote, profile] = await Promise.all([
      fetchFinnhub<unknown>(`${FINNHUB_BASE_URL}/quote?symbol=${q}&token=${token}`, QUOTE_SECONDS(index)).catch(failed),
      fetchFinnhub<FinnhubProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${q}&token=${token}`, PROFILE_SECONDS).catch(failed),
    ]);

    const normalized = normalizeQuote(quote?.data, generatedAt);
    const p = profile?.data;
    // Every S&P 500 listing trades in dollars. A profile in another currency would put its market cap in that
    // currency, so it is left out rather than shown as dollars.
    const capInDollars = !p?.currency || p.currency === 'USD';
    const cap = capInDollars && typeof p?.marketCapitalization === 'number' && Number.isFinite(p.marketCapitalization) && p.marketCapitalization > 0
      ? p.marketCapitalization
      : undefined;

    return {
      ...stock,
      name: p?.name || stock.name,
      exchange: shortExchange(p?.exchange),
      logo: p?.logo && /^https:\/\//.test(p.logo) ? p.logo : undefined,
      marketCap: cap,
      quote: normalized,
      fetchedAt: normalized ? quote?.fetchedAt : undefined,
    };
  });

  // One line instead of one per stock, without URLs (they carry the key)
  if (issues.length) console.error(`getHeatmapData: ${issues.length} Finnhub requests failed (${[...new Set(issues)].join(', ')})`);
  return { provider: 'Finnhub', stocks, generatedAt, failedRequests: issues.length, issue: worstIssue(issues) };
}
