import { describe, expect, it } from 'vitest';
import { HEATMAP_SYMBOLS } from '@/lib/data/heatmap';
import { SECTOR_ETFS } from '@/lib/data/markets';
import {
  DEFAULT_STATE,
  EXTENDED_HOURS_OPTIONS,
  GROUP_OPTIONS,
  interactiveSupports,
  PERIOD_OPTIONS,
  SIZE_OPTIONS,
  TRADINGVIEW_COLOR,
  TRADINGVIEW_GROUP,
  TRADINGVIEW_SIZE,
  focusSector,
  interactiveSettings,
  parseHeatmapState,
  selectStock,
  serializeHeatmapState,
} from '@/lib/heatmap-state';

const known = { sectors: new Set<string>(SECTOR_ETFS.map((s) => s.sector)), symbols: new Set<string>(HEATMAP_SYMBOLS) };
const parse = (query: string) => parseHeatmapState(new URLSearchParams(query), known);

describe('heatmap view in the address bar', () => {
  it('opens the interactive map at 1 day, market cap, by sector', () => {
    expect(parse('')).toEqual(DEFAULT_STATE);
    expect(DEFAULT_STATE).toEqual({ view: 'interactive', color: '1d', size: 'cap', group: 'sector' });
  });

  it('reads every setting', () => {
    expect(parse('view=tradingview&color=ytd&size=dollar-volume&group=none&sector=Energy&symbol=xom')).toEqual({
      view: 'tradingview',
      color: 'ytd',
      size: 'dollar-volume',
      group: 'none',
      sector: 'Energy',
      symbol: 'XOM',
    });
  });

  it('falls back to defaults for anything unknown, so an old or edited link still works', () => {
    expect(parse('view=canvas&color=2d&size=float&group=industry&sector=Crypto&symbol=ZZZZ')).toEqual(DEFAULT_STATE);
  });

  it('only accepts stocks that are on the map', () => {
    expect(parse('symbol=PLTR').symbol).toBeUndefined();
    expect(parse('symbol=BRK.B').symbol).toBe('BRK.B');
  });

  it('writes short links and reads back what it wrote', () => {
    expect(serializeHeatmapState(DEFAULT_STATE)).toBe('');
    const state = { view: 'tradingview' as const, color: 'postmarket' as const, size: 'equal' as const, group: 'none' as const, sector: 'Health Care', symbol: 'LLY' };
    const query = serializeHeatmapState(state);
    expect(query).toBe('?view=tradingview&color=postmarket&size=equal&group=none&sector=Health+Care&symbol=LLY');
    expect(parse(query.slice(1))).toEqual(state);
  });
});

describe('what the interactive map can show', () => {
  it("supports the periods Finnhub's daily stats back, and every size", () => {
    expect([...interactiveSupports(false).color]).toEqual(['1d', '1w', 'mtd', '3m', '6m', 'ytd', '1y']);
    expect([...interactiveSupports(false).size].sort()).toEqual(['cap', 'dollar-volume', 'equal', 'volume']);
  });

  it('adds 1H, 4H, 1M and extended hours with Alpaca', () => {
    expect([...interactiveSupports(true).color].sort()).toEqual(['1d', '1h', '1m', '1w', '1y', '3m', '4h', '6m', 'mtd', 'postmarket', 'premarket', 'ytd']);
    expect(interactiveSettings({ ...DEFAULT_STATE, color: '1h' }, true)).toEqual({ color: '1h', size: 'cap', colorFellBack: false, sizeFellBack: false });
    expect(interactiveSettings({ ...DEFAULT_STATE, color: 'premarket' }, false).colorFellBack).toBe(true);
  });

  it('falls back openly, never quietly showing another measure under the chosen label', () => {
    expect(interactiveSettings({ ...DEFAULT_STATE, color: '1h', size: 'volume' })).toEqual({ color: '1d', size: 'volume', colorFellBack: true, sizeFellBack: false });
    expect(interactiveSettings({ ...DEFAULT_STATE, color: '1m' })).toEqual({ color: '1d', size: 'cap', colorFellBack: true, sizeFellBack: false });
    expect(interactiveSettings({ ...DEFAULT_STATE, color: 'ytd' })).toEqual({ color: 'ytd', size: 'cap', colorFellBack: false, sizeFellBack: false });
    expect(interactiveSettings({ ...DEFAULT_STATE, size: 'equal' })).toEqual({ color: '1d', size: 'equal', colorFellBack: false, sizeFellBack: false });
  });
});

describe('selection and sector focus', () => {
  it('focusing a sector switches to the interactive map and keeps the selection and filters', () => {
    const state = { ...DEFAULT_STATE, view: 'tradingview' as const, color: '1m' as const, symbol: 'AAPL' };
    expect(focusSector(state, 'Energy')).toEqual({ ...state, view: 'interactive', sector: 'Energy' });
    expect(focusSector(focusSector(state, 'Energy'), undefined).sector).toBeUndefined();
  });

  it('selecting a stock changes nothing else', () => {
    const state = { ...DEFAULT_STATE, sector: 'Energy', group: 'none' as const };
    expect(selectStock(state, 'XOM')).toEqual({ ...state, symbol: 'XOM' });
    expect(selectStock(selectStock(state, 'XOM'), undefined)).toEqual({ ...state, symbol: undefined });
  });
});

describe('TradingView settings', () => {
  it('has a TradingView value for every option but month to date, which TradingView lacks', () => {
    for (const { value } of [...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS]) {
      if (value === 'mtd') expect(TRADINGVIEW_COLOR[value]).toBeUndefined();
      else expect(TRADINGVIEW_COLOR[value]).toBeTruthy();
    }
    for (const { value } of SIZE_OPTIONS) expect(TRADINGVIEW_SIZE[value].blockSize).toBeTruthy();
    for (const { value } of GROUP_OPTIONS) expect(TRADINGVIEW_GROUP[value]).toBeTruthy();
  });

  it('sizes equally by mono size, not by a made-up metric', () => {
    expect(TRADINGVIEW_SIZE.equal).toEqual({ blockSize: 'market_cap_basic', isMonoSize: true });
    expect(TRADINGVIEW_SIZE.volume.isMonoSize).toBe(false);
  });

  it('colors extended hours by extended-hours change', () => {
    expect(TRADINGVIEW_COLOR.premarket).toBe('premarket_change');
    expect(TRADINGVIEW_COLOR.postmarket).toBe('postmarket_change');
    expect(TRADINGVIEW_COLOR['1d']).toBe('change');
  });
});
