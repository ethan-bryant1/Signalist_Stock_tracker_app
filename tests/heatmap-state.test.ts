import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  EXTENDED_HOURS_OPTIONS,
  GROUP_OPTIONS,
  PERIOD_OPTIONS,
  SIZE_OPTIONS,
  TRADINGVIEW_COLOR,
  TRADINGVIEW_GROUP,
  TRADINGVIEW_SIZE,
  parseHeatmapState,
  serializeHeatmapState,
} from '@/lib/heatmap-state';

const parse = (query: string) => parseHeatmapState(new URLSearchParams(query));

describe('heatmap settings in the address bar', () => {
  it('opens at 1 day, market cap, by sector', () => {
    expect(parse('')).toEqual(DEFAULT_STATE);
    expect(DEFAULT_STATE).toEqual({ color: '1d', size: 'cap', group: 'sector' });
  });

  it('reads every setting', () => {
    expect(parse('color=ytd&size=dollar-volume&group=none')).toEqual({ color: 'ytd', size: 'dollar-volume', group: 'none' });
  });

  it('falls back to defaults for anything unknown, so an old or edited link still works', () => {
    expect(parse('color=2d&size=float&group=industry')).toEqual(DEFAULT_STATE);
    // Links from the old interactive view
    expect(parse('view=interactive&sector=Energy&symbol=XOM&color=mtd')).toEqual(DEFAULT_STATE);
  });

  it('writes short links and reads back what it wrote', () => {
    expect(serializeHeatmapState(DEFAULT_STATE)).toBe('');
    const state = { color: 'postmarket' as const, size: 'equal' as const, group: 'none' as const };
    const query = serializeHeatmapState(state);
    expect(query).toBe('?color=postmarket&size=equal&group=none');
    expect(parse(query.slice(1))).toEqual(state);
  });
});

describe('TradingView settings', () => {
  it('has a TradingView value for every option', () => {
    for (const { value } of [...PERIOD_OPTIONS, ...EXTENDED_HOURS_OPTIONS]) expect(TRADINGVIEW_COLOR[value]).toBeTruthy();
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
