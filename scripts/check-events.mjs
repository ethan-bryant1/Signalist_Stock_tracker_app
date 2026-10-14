// Checks the three free schedules behind the News page's "Upcoming events" panel: that each site answers this
// computer and still sends the format the app reads. No keys needed. Prints the next few entries of each.
//
//   npm run check:events
const USER_AGENT = 'Mozilla/5.0 (compatible; LoopsWatch/1.0; personal research app)';
const FEEDS = [
  { name: 'Federal Reserve calendar', url: 'https://www.federalreserve.gov/json/calendar.json', kind: 'json' },
  { name: 'BLS release schedule', url: 'https://www.bls.gov/schedule/news_release/bls.ics', kind: 'ics' },
  { name: 'BEA release schedule', url: 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', kind: 'ics' },
];
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
let failed = 0;

for (const feed of FEEDS) {
  try {
    const res = await fetch(feed.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let upcoming;
    if (feed.kind === 'json') {
      const events = JSON.parse(text.replace(/^﻿/, '')).events;
      if (!Array.isArray(events)) throw new Error('no "events" list');
      upcoming = events
        .filter((e) => ['FOMC', 'Speeches', 'Testimony', 'Beige'].includes(e.type))
        .map((e) => ({ when: `${e.month}-${String(e.days).split(',')[0].trim().padStart(2, '0')} ${e.time || 'all day'}`, title: e.title }))
        .filter((e) => e.when.slice(0, 10).replace(/-/g, '') >= today)
        .sort((a, b) => a.when.localeCompare(b.when));
      console.log(`OK    ${feed.name}: ${events.length} entries`);
    } else {
      const blocks = text.split('BEGIN:VEVENT').slice(1);
      if (blocks.length === 0) throw new Error('no events in the file');
      upcoming = blocks
        .map((b) => ({ when: /DTSTART[^:]*:(\S+)/.exec(b)?.[1] ?? '', title: (/SUMMARY:(.*)/.exec(b)?.[1] ?? '').replace(/\\,/g, ',').trim() }))
        .filter((e) => e.when.slice(0, 8) >= today)
        .sort((a, b) => a.when.localeCompare(b.when));
      console.log(`OK    ${feed.name}: ${blocks.length} entries`);
    }
    for (const e of upcoming.slice(0, 4)) console.log(`        ${e.when}  ${e.title}`);
    if (upcoming.length === 0) console.log('        (nothing dated today or later; the file may not cover the coming weeks yet)');
  } catch (error) {
    failed++;
    console.log(`FAIL  ${feed.name}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
