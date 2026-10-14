// Checks the real FRED data behind the Economy page with your own key, and prints a pass/fail report.
//
//   npm run check:fred        every indicator (about 40 requests, under a minute)
//
// It reads FRED_API_KEY from .env and never prints it: request URLs aren't shown, and errors are reduced to the HTTP
// status and FRED's message. It sends about two requests a second, far under FRED's 120 a minute.
//
// What it checks, written apart from the app's own code (lib/indicators.ts) so a mistake in one shows up as a
// disagreement with the other:
//   - each series answers with a recent, numeric observation, a title and a last-updated time
//   - FRED's year-over-year transformation (units=pc1) matches the change computed here from the raw index
//   - the release calendar returns a date on or after today for each monthly, weekly and quarterly series
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ quiet: true });

const BASE = 'https://api.stlouisfed.org/fred';
const KEY = process.env.FRED_API_KEY?.trim();
if (!KEY) {
  console.error('FAIL  FRED_API_KEY is not set in .env (get a free key at https://fred.stlouisfed.org/docs/api/api_key.html)');
  process.exit(1);
}

// The series, read from the app's own list so this always checks what the app shows
const source = readFileSync(new URL('../lib/indicators.ts', import.meta.url), 'utf8');
const series = [...source.matchAll(/seriesId: "([A-Z0-9]+)", units: "(\w+)", group: "\w+", label: "([^"]+)", measure: "[^"]*", frequency: "(\w+)"/g)].map((m) => ({ id: m[1], units: m[2], label: m[3], frequency: m[4] }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;
let failed = 0;
const report = (ok, text) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
};

async function get(path, params) {
  await sleep(500);
  requests++;
  const res = await fetch(`${BASE}${path}?${new URLSearchParams({ ...params, file_type: 'json', api_key: KEY })}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}${body.error_message ? `: ${body.error_message.replace(KEY, '[key]')}` : ''}`);
  return body;
}

const numeric = (observations) => observations.filter((o) => o.value !== '.' && Number.isFinite(Number(o.value)));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(Date.now());
const maxAgeDays = { daily: 10, weekly: 21, monthly: 75, quarterly: 200 };
const releases = new Map();

console.log(`Checking ${series.length} FRED series (today in New York: ${today})\n`);
for (const s of series) {
  try {
    const obs = numeric((await get('/series/observations', { series_id: s.id, units: s.units, sort_order: 'desc', limit: '10' })).observations ?? []);
    const latest = obs[0];
    const age = latest ? (Date.parse(today) - Date.parse(latest.date)) / 86_400_000 : Infinity;
    report(!!latest && age <= maxAgeDays[s.frequency], `${s.label} (${s.id}): latest ${latest ? `${latest.value} for ${latest.date}` : 'missing'}${age > maxAgeDays[s.frequency] ? ` — older than ${maxAgeDays[s.frequency]} days` : ''}`);

    const info = (await get('/series', { series_id: s.id })).seriess?.[0];
    report(!!info?.title && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}$/.test(info?.last_updated ?? ''), `${s.id}: "${info?.title}", last updated ${info?.last_updated}`);

    if (s.units === 'pc1' && latest) {
      // Year-over-year from the raw index: (this month / same month a year earlier) − 1
      const raw = numeric((await get('/series/observations', { series_id: s.id, sort_order: 'desc', limit: '13' })).observations ?? []);
      const now = raw.find((o) => o.date === latest.date);
      const yearAgoDate = `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`;
      const before = raw.find((o) => o.date === yearAgoDate);
      const mine = now && before ? ((Number(now.value) - Number(before.value)) / Number(before.value)) * 100 : undefined;
      report(mine !== undefined && Math.abs(mine - Number(latest.value)) < 0.01, `${s.id}: FRED's year-over-year ${latest.value}% vs computed here ${mine?.toFixed(5) ?? '—'}%`);
    }

    if (s.frequency !== 'daily') {
      const release = (await get('/series/release', { series_id: s.id })).releases?.[0];
      if (release && !releases.has(release.id)) {
        const dates = (await get('/release/dates', { release_id: String(release.id), realtime_start: today, include_release_dates_with_no_data: 'true', sort_order: 'asc', limit: '10' })).release_dates ?? [];
        releases.set(release.id, { name: release.name, next: dates.map((d) => d.date).find((d) => d >= today) });
      }
      const found = release && releases.get(release.id);
      report(!!found?.next, `${s.id}: release "${found?.name ?? '—'}", next ${found?.next ?? 'not found'}`);
    }
  } catch (error) {
    report(false, `${s.label} (${s.id}): ${error.message}`);
  }
}

console.log(`\n${requests} requests, ${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
