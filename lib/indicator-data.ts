import 'server-only';

import { mapWithLimit, worstIssue } from '@/lib/finnhub';
import { FRED_CACHE, fredGet, getFredKey } from '@/lib/fred';
import {
  INDICATORS,
  nextReleaseDate,
  parseObservations,
  parseRelease,
  parseReleaseDates,
  parseSeriesInfo,
  summarize,
  type IndicatorDef,
  type IndicatorReading,
  type IndicatorsPayload,
} from '@/lib/indicators';
import { newYorkClock } from '@/lib/market-data';
import { issueOf } from '@/lib/providers/gate';

// The economic indicators the Economy page and the workspace widget show, from FRED. Everything is cached for
// hours (lib/fred.ts), so after the first load a visit costs no FRED calls; nothing polls. Uses no Finnhub calls.

// How long a page waits for FRED before showing what it has; requests still queued keep going and fill the cache
export const INDICATOR_WAIT_MS = 8000;

// Calls at once, so the first, uncached load doesn't send every request in the same instant
const CONCURRENCY = 6;

// The next scheduled release of the publication a series belongs to. Daily series (rates) are published every
// business day, so they skip it. Any failure here only leaves the date out.
async function nextRelease(indicator: IndicatorDef, today: string, waitMs: number) {
  if (indicator.frequency === 'daily') return {};
  try {
    const { data } = await fredGet<unknown>('/series/release', { series_id: indicator.seriesId }, { ...FRED_CACHE.release, waitMs });
    const release = parseRelease(data);
    if (!release) return {};
    const id = String(release.id);
    const dates = await fredGet<unknown>(
      '/release/dates',
      { release_id: id, realtime_start: today, include_release_dates_with_no_data: 'true', sort_order: 'asc', limit: '10' },
      { ...FRED_CACHE.releaseDates, waitMs },
      // Keyed by the release alone, so the cached calendar is reused across days; passed dates are skipped below
      { release_id: id }
    );
    return { releaseName: release.name, nextRelease: nextReleaseDate(parseReleaseDates(dates.data), today) };
  } catch {
    return {};
  }
}

async function readIndicator(indicator: IndicatorDef, today: string, waitMs: number): Promise<IndicatorReading> {
  const { seriesId, units, points } = indicator;
  const [observations, info, release] = await Promise.all([
    fredGet<unknown>('/series/observations', { series_id: seriesId, units, sort_order: 'desc', limit: String(points) }, { ...FRED_CACHE.observations, waitMs })
      .then((served) => ({ served }))
      .catch((error: unknown) => ({ error })),
    fredGet<unknown>('/series', { series_id: seriesId }, { ...FRED_CACHE.series, waitMs }).then((served) => parseSeriesInfo(served.data)).catch(() => ({})),
    nextRelease(indicator, today, waitMs),
  ]);

  if ('error' in observations) return { id: indicator.id, history: [], ...info, ...release, issue: issueOf(observations.error) };

  const history = parseObservations(observations.served.data);
  return {
    id: indicator.id,
    history,
    ...summarize(history),
    ...info,
    ...release,
    fetchedAt: observations.served.fetchedAt,
    cached: observations.served.stale || undefined,
    issue: history.length ? undefined : 'provider',
  };
}

export async function getIndicators(waitMs = INDICATOR_WAIT_MS): Promise<IndicatorsPayload> {
  if (!getFredKey()) return { configured: false };
  const today = newYorkClock(Date.now()).day;
  const readings = await mapWithLimit(INDICATORS, CONCURRENCY, (indicator) => readIndicator(indicator, today, waitMs));
  const failed = readings.filter((reading) => !reading.latest);
  if (failed.length) console.error(`Economic indicators: ${failed.length} of ${readings.length} FRED series missing (${[...new Set(failed.map((r) => r.issue))].join(', ')})`);
  return {
    configured: true,
    readings,
    generatedAt: Date.now(),
    failed: failed.length,
    issue: worstIssue(failed.flatMap((reading) => (reading.issue ? [reading.issue] : []))),
  };
}
