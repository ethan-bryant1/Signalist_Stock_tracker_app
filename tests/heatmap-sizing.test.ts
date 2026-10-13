import { describe, expect, it } from 'vitest';
import { sizeWhileLoading, unplacedStocks } from '@/components/StockHeatmap';
import type { HeatmapStock } from '@/lib/market-data';

const stock = (symbol: string, extra: Partial<HeatmapStock> = {}): HeatmapStock => ({ symbol, name: symbol, sector: 'Information Technology', industry: '', ...extra });
const quote = { price: 100, change: 1, changePercent: 1, previousClose: 99, time: 0 } as unknown as HeatmapStock['quote'];

describe('sizeWhileLoading', () => {
  it('draws equal tiles while prices are in but no market cap has arrived', () => {
    const stocks = [stock('AAPL', { quote }), stock('MSFT', { quote })];
    expect(sizeWhileLoading(stocks, 'cap')).toBe('equal');
    expect(unplacedStocks(stocks, sizeWhileLoading(stocks, 'cap'))).toEqual([]);
  });

  it('keeps market-cap sizing once any cap arrives, listing the rest as not drawn', () => {
    const stocks = [stock('AAPL', { quote, marketCap: 3_000_000 }), stock('MSFT', { quote })];
    expect(sizeWhileLoading(stocks, 'cap')).toBe('cap');
    expect(unplacedStocks(stocks, 'cap').map((s) => s.symbol)).toEqual(['MSFT']);
  });

  it('leaves an empty map alone when nothing is priced yet', () => {
    expect(sizeWhileLoading([stock('AAPL')], 'cap')).toBe('cap');
  });
});
