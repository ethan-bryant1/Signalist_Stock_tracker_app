import { describe, expect, it } from 'vitest';
import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { INDEX_ETFS, MACRO_ETFS, SECTOR_BY_NAME, SECTOR_ETFS } from '@/lib/data/markets';
import { MARKET_SECTORS, SP500_COMPANIES } from '@/lib/data/sp500';

const BY_SYMBOL = new Map(SP500_COMPANIES.map((c) => [c.symbol, c]));

describe('the S&P 500 list', () => {
  it('has each listing once', () => {
    expect(new Set(SP500_COMPANIES.map((c) => c.symbol)).size).toBe(SP500_COMPANIES.length);
  });

  it('is about the size of the index (500 companies, some with two share classes)', () => {
    expect(SP500_COMPANIES.length).toBeGreaterThanOrEqual(500);
    expect(SP500_COMPANIES.length).toBeLessThanOrEqual(505);
  });

  it('puts every company in one of the 11 GICS sectors', () => {
    const sectors = new Set<string>(MARKET_SECTORS.map((s) => s.value));
    for (const c of SP500_COMPANIES) expect(sectors.has(c.sector)).toBe(true);
  });

  it("writes class B shares with a dot, as Finnhub's US symbols do", () => {
    expect(BY_SYMBOL.has('BRK.B')).toBe(true);
    expect(BY_SYMBOL.has('BRK-B')).toBe(false);
  });
});

describe('the interactive map', () => {
  it('only shows S&P 500 companies, each once', () => {
    expect(new Set(HEATMAP_SYMBOLS).size).toBe(HEATMAP_SYMBOLS.length);
    for (const symbol of HEATMAP_SYMBOLS) expect(BY_SYMBOL.has(symbol), symbol).toBe(true);
  });

  it('covers all 11 sectors with at least three companies', () => {
    const counts = new Map<string, number>();
    for (const symbol of HEATMAP_SYMBOLS) {
      const sector = BY_SYMBOL.get(symbol)!.sector;
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
    expect(counts.size).toBe(11);
    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(3);
  });

  it('keeps one share class per company', () => {
    const names = HEATMAP_SYMBOLS.map((symbol) => BY_SYMBOL.get(symbol)!.name.replace(/\s*\(Class [A-Z]\)$/, ''));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('sector ETFs', () => {
  it('map every GICS sector to exactly one SPDR fund', () => {
    expect(SECTOR_ETFS.map((s) => s.sector).sort()).toEqual(MARKET_SECTORS.map((s) => s.value).sort());
    expect(new Set(SECTOR_ETFS.map((s) => s.symbol)).size).toBe(SECTOR_ETFS.length);
    for (const s of MARKET_SECTORS) expect(SECTOR_BY_NAME.get(s.value)?.sector).toBe(s.value);
  });

  it('use the Select Sector SPDR tickers', () => {
    expect(Object.fromEntries(SECTOR_ETFS.map((s) => [s.sector, s.symbol]))).toEqual({
      'Information Technology': 'XLK',
      Financials: 'XLF',
      'Health Care': 'XLV',
      'Consumer Discretionary': 'XLY',
      'Communication Services': 'XLC',
      Industrials: 'XLI',
      'Consumer Staples': 'XLP',
      Energy: 'XLE',
      Utilities: 'XLU',
      'Real Estate': 'XLRE',
      Materials: 'XLB',
    });
  });

  it('have a short name for headings no longer than the full name', () => {
    for (const s of SECTOR_ETFS) expect(s.short.length).toBeLessThanOrEqual(s.sector.length);
  });

  it("aren't confused with the index and macro funds", () => {
    const others = new Set<string>([...INDEX_ETFS, ...MACRO_ETFS].map((e) => e.symbol));
    for (const s of SECTOR_ETFS) expect(others.has(s.symbol)).toBe(false);
  });
});
