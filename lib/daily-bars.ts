// Daily price bars from Alpaca's free plan, for the Portfolio page's backtests. No server or browser APIs, so the rules
// are unit tested (tests/daily-bars.test.ts).
//
// What the bars are: Alpaca's 1Day bars from the consolidated SIP feed, adjusted for splits and dividends
// (adjustment=all), so a return measured on them includes reinvested dividends. Each bar is keyed by its New York
// session day; Alpaca stamps a daily bar with midnight New York time in UTC ("2026-10-13T04:00:00Z").
// The free plan serves SIP data only up to 15 minutes ago and back to 2016.

import { addDays, closeMinutes, isTradingDay, nextTradingDay } from "@/lib/market-calendar";
import { newYorkClock, newYorkMs } from "@/lib/market-data";

// One symbol's bars, oldest first, as columns (compact to store and send)
export type DailyBars = {
    days: string[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
};

// The earliest day the free plan has history for
export const HISTORY_START_DAY = "2016-01-01";

// A day's bar is final once its after-hours session has ended (Alpaca may count extended-hours trades in it) and a
// few minutes have passed for late prints: 8:20 PM New York, or 5:20 PM after an early close.
const SETTLE_MINUTES = 20;
const finalAt = (day: string) => newYorkMs(day, closeMinutes(day) + 4 * 60 + SETTLE_MINUTES);

const previousTradingDay = (day: string) => {
    let previous = addDays(day, -1);
    for (let i = 0; i < 10 && !isTradingDay(previous); i++) previous = addDays(previous, -1);
    return previous;
};

// The newest session day whose bar is final at `now`
export const lastFinalDay = (now: number) => {
    const { day } = newYorkClock(now);
    if (isTradingDay(day) && now >= finalAt(day)) return day;
    return previousTradingDay(day);
};

// When the next session's bar becomes final, so a cached history is reused until a newer bar can exist
export const nextFinalAt = (now: number) => {
    const { day } = newYorkClock(now);
    if (isTradingDay(day) && now < finalAt(day)) return finalAt(day);
    return finalAt(nextTradingDay(addDays(day, 1)));
};

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

export const emptyBars = (): DailyBars => ({ days: [], open: [], high: [], low: [], close: [], volume: [] });

// One symbol's bars from an Alpaca /v2/stocks/bars answer ({ bars: { AAPL: [{ t, o, h, l, c, v }] } }), oldest first.
// A bar with a missing or non-positive open or close is skipped and counted, never filled in; so is a bar for a day
// that isn't final at `now` (today's bar while the session is still running) and a second bar for the same day.
export function readDailyBars(raw: unknown, symbol: string, now: number): { bars: DailyBars; skipped: number } {
    const list = (raw as { bars?: Record<string, unknown> } | null)?.bars?.[symbol];
    const bars = emptyBars();
    let skipped = 0;
    if (!Array.isArray(list)) return { bars, skipped };
    const newest = lastFinalDay(now);
    const rows: { day: string; o: number; h: number; l: number; c: number; v: number }[] = [];
    for (const item of list as Record<string, unknown>[]) {
        const time = typeof item?.t === "string" ? Date.parse(item.t) : NaN;
        const o = num(item?.o);
        const c = num(item?.c);
        if (!Number.isFinite(time) || !o || !c || o <= 0 || c <= 0) {
            skipped++;
            continue;
        }
        const day = newYorkClock(time).day;
        if (day > newest) continue;
        rows.push({ day, o, c, h: num(item.h) ?? Math.max(o, c), l: num(item.l) ?? Math.min(o, c), v: num(item.v) ?? 0 });
    }
    rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    for (const row of rows) {
        if (bars.days.at(-1) === row.day) {
            skipped++;
            continue;
        }
        bars.days.push(row.day);
        bars.open.push(row.o);
        bars.high.push(row.h);
        bars.low.push(row.l);
        bars.close.push(row.c);
        bars.volume.push(row.v);
    }
    return { bars, skipped };
}

// Joins pages of one symbol's bars (each already in order) into one series
export function joinBars(pages: readonly DailyBars[]): DailyBars {
    const joined = emptyBars();
    for (const page of pages) {
        page.days.forEach((day, i) => {
            if (joined.days.length && day <= joined.days.at(-1)!) return;
            joined.days.push(day);
            joined.open.push(page.open[i]);
            joined.high.push(page.high[i]);
            joined.low.push(page.low[i]);
            joined.close.push(page.close[i]);
            joined.volume.push(page.volume[i]);
        });
    }
    return joined;
}
