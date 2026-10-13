import 'server-only';

import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { SP500_COMPANIES } from '@/lib/data/sp500';
import { FINNHUB_CACHE, finnhubGet, getFinnhubToken, worstIssue } from '@/lib/finnhub';
import { issueOf } from '@/lib/providers/gate';
import { marketTtlMs, normalizeQuote, sameCompany, type FeedIssue, type HeatmapPayload, type HeatmapStock } from '@/lib/market-data';

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
// the next open (see marketTtlMs). Company profiles (name, logo, market cap) come from FINNHUB_CACHE (a day, kept
// in MongoDB).
const QUOTE_MS = (index: number, now: number) => marketTtlMs(now, (270 + (index % 5) * 15) * 1000);
// The page waits this long for figures; anything still queued for Finnhub's budget keeps loading in the background
// and arrives with the next refresh, so an empty cache never holds the page for minutes
const WAIT_MS = 3000;
// The Market Snapshot's data: every stock in the universe with its latest Finnhub quote and profile.
// Shared by everyone through the Finnhub gate's cache, so viewers and tabs don't add Finnhub requests.
// Stocks whose figures fail to load are still returned, without them, so the page can say which are missing.
// Only call this for a signed-in viewer (the dashboard and /api/heatmap check).
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

  const stocks = await Promise.all(base.map(async (stock, index): Promise<HeatmapStock> => {
    const symbol = { symbol: stock.symbol };
    // The map shows the 1-day change sized by market cap, so it needs only the quote and the profile
    const [quote, profile] = await Promise.all([
      finnhubGet<unknown>('/quote', symbol, { ...FINNHUB_CACHE.quote, ttlMs: QUOTE_MS(index, generatedAt), waitMs: WAIT_MS }).catch(failed),
      // The map is sized by the profile's market cap, so it loads with the prices rather than behind them
      finnhubGet<FinnhubProfile>('/stock/profile2', symbol, { ...FINNHUB_CACHE.profile, priority: 'interactive', waitMs: WAIT_MS }).catch(failed),
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

    return {
      ...stock,
      name: p?.name || stock.name,
      exchange: shortExchange(p?.exchange),
      logo: p?.logo && /^https:\/\//.test(p.logo) ? p.logo : undefined,
      marketCap: cap,
      quote: normalized,
      fetchedAt: normalized ? quote?.fetchedAt : undefined,
    };
  }));

  // One line instead of one per stock, without URLs (they carry the key)
  if (issues.length) console.error(`getHeatmapData: ${issues.length} Finnhub requests failed (${[...new Set(issues)].join(', ')})`);
  return { provider: 'Finnhub', stocks, generatedAt, failedRequests: issues.length, issue: worstIssue(issues) };
}
