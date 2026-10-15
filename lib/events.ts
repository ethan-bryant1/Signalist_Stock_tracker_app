import { formatNewYorkDay, formatNewYorkTime, newYorkClock, newYorkMs, type FeedIssue } from "@/lib/market-data";
import type { EventFilter } from "@/lib/news";

// Upcoming market-moving events for the News page, from free official schedules (fetched in lib/events-data.ts):
// - the Federal Reserve Board's calendar (federalreserve.gov/json/calendar.json): FOMC meetings, press conferences
//   and minutes, speeches and testimony by the Chair, Vice Chairs and Governors, and the Beige Book;
// - the Bureau of Labor Statistics release schedule (bls.ics): jobs report, CPI, PPI and other major releases;
// - the Bureau of Economic Analysis release schedule (ics): GDP, personal income and outlays (PCE), trade.
// These list when something happens, never forecasts or results; the times are the agencies' own, shown in New York
// time. Speeches by regional Fed presidents aren't on the Board's calendar, so they aren't listed.
// Pure parsing and selection, no server or browser APIs, so tests/events.test.ts covers it.

export type EventSource = "Federal Reserve" | "BLS" | "BEA";
export type EventKind = "fomc" | "speech" | "testimony" | "fed" | "data";

export type MarketEvent = {
    id: string;
    title: string;
    // The kind of appearance when the agency names it ("Speech", "Panel Discussion", "Testimony")
    format?: string;
    // The topic of a speech or the meeting's note, as the agency wrote it
    detail?: string;
    location?: string;
    kind: EventKind;
    source: EventSource;
    // When it happens; midnight New York time when the agency gives no time
    start: number;
    timed: boolean;
    url?: string;
};

// What the server sends the page: the events, and per source when its copy was fetched, whether it's an older copy
// kept because a new one couldn't be fetched, and why it failed when it did
export type EventsResult = {
    events: MarketEvent[];
    sources: { source: EventSource; fetchedAt?: number; stale: boolean; issue?: FeedIssue }[];
    checkedAt: number;
};

export const EVENT_KIND_LABELS: Record<EventKind, string> = { fomc: "FOMC", speech: "Fed speaker", testimony: "Testimony", fed: "Fed report", data: "Economic data" };

// ---------- Text clean-up ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", auml: "ä", ouml: "ö", uuml: "ü", eacute: "é", egrave: "è", aacute: "á", iacute: "í", oacute: "ó", ccedil: "ç", ntilde: "ñ" };

// Plain text from the calendar's bits of HTML: tags removed, entities decoded, whitespace collapsed
export const plainText = (value: unknown): string =>
    typeof value !== "string"
        ? ""
        : value
              .replace(/<[^>]*>/g, " ")
              .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
              .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
              .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? match)
              .replace(/\s+/g, " ")
              .trim();

// An http(s) link, made absolute against `base` when it is a site path; anything else is dropped
export const safeUrl = (value: unknown, base?: string): string | undefined => {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try {
        const url = new URL(value.trim(), base);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
    } catch {
        return undefined;
    }
};

// ---------- Federal Reserve Board calendar ----------

const FED_SITE = "https://www.federalreserve.gov/";
const FED_KINDS: Record<string, EventKind> = { FOMC: "fomc", Speeches: "speech", Testimony: "testimony", Beige: "fed" };

// "2:00 p.m." → minutes after midnight; undefined when there is no clock time
export const parseClock = (value: unknown): number | undefined => {
    const match = typeof value === "string" ? /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i.exec(value) : null;
    if (!match) return undefined;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 1 || hour > 12 || minute > 59) return undefined;
    return ((hour % 12) + (match[3].toLowerCase() === "p" ? 12 : 0)) * 60 + minute;
};

// The Board's calendar file ({ events: [{ title, time, month: "2026-10", days: "28", type, ... }] }). Its times are
// Eastern. An entry listing several days becomes one event per day. Statistical releases and holidays are left out.
export function parseFedCalendar(text: string): MarketEvent[] {
    let raw: unknown;
    try {
        raw = JSON.parse(text.replace(/^﻿/, ""));
    } catch {
        return [];
    }
    const entries = raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events) ? (raw as { events: unknown[] }).events : [];
    const events: MarketEvent[] = [];
    for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        const kind = typeof e.type === "string" ? FED_KINDS[e.type] : undefined;
        let title = plainText(e.title);
        let format: string | undefined;
        // "Speech - Governor Christopher J. Waller": the format becomes the row's label and the speaker its title
        const split = kind === "speech" || kind === "testimony" ? /^(.{3,40}?) - (.+)$/.exec(title) : null;
        if (split) [, format, title] = split;
        const month = typeof e.month === "string" && /^\d{4}-\d{2}$/.test(e.month) ? e.month : undefined;
        if (!kind || !title || !month) continue;
        const minutes = parseClock(e.time);
        const detail = plainText(e.description) || undefined;
        const location = plainText(e.location) || undefined;
        const url = safeUrl(e.link, FED_SITE) ?? safeUrl(e.live, FED_SITE);
        for (const part of String(e.days ?? "").split(",")) {
            const date = Number(part.trim());
            if (!Number.isInteger(date) || date < 1 || date > 31) continue;
            const day = `${month}-${String(date).padStart(2, "0")}`;
            const start = newYorkMs(day, minutes ?? 0);
            // A day that doesn't exist in that month (Feb 30) lands on another date; skip it
            if (newYorkClock(start).day !== day) continue;
            events.push({ id: `fed|${day}|${minutes ?? ""}|${format ?? ""}|${title}`, title, format, detail, location, kind, source: "Federal Reserve", start, timed: minutes !== undefined, url });
        }
    }
    return events;
}

// ---------- iCalendar release schedules (BLS, BEA) ----------

export type IcsEvent = { summary: string; start: number; timed: boolean };

const unescapeIcs = (value: string) => value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? " " : c));

// DTSTART values: 20261125T133000Z (UTC), 20251024T083000 with an Eastern TZID or no zone (taken as New York, the
// agencies' time zone), or 20251024 for a whole day. Undefined for anything else, including other named zones.
export const parseIcsStart = (params: string, value: string): { start: number; timed: boolean } | undefined => {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value.trim());
    if (!match) return undefined;
    const [, y, mo, d, h, mi, , utc] = match;
    const day = `${y}-${mo}-${d}`;
    if (h === undefined) return { start: newYorkMs(day, 0), timed: false };
    const minutes = Number(h) * 60 + Number(mi);
    if (utc) return { start: Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)), timed: true };
    const zone = /TZID=([^;:]+)/i.exec(params)?.[1];
    if (zone && !/eastern|new_york/i.test(zone)) return undefined;
    return { start: newYorkMs(day, minutes), timed: true };
};

export function parseIcs(text: string): IcsEvent[] {
    // Long lines continue on the next line after a space or tab
    const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const events: IcsEvent[] = [];
    let current: { summary?: string; start?: { start: number; timed: boolean } } | null = null;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") current = {};
        else if (line === "END:VEVENT") {
            if (current?.summary && current.start) events.push({ summary: current.summary, ...current.start });
            current = null;
        } else if (current) {
            const colon = line.indexOf(":");
            if (colon < 0) continue;
            const [name, ...params] = line.slice(0, colon).split(";");
            const value = line.slice(colon + 1);
            if (name.toUpperCase() === "SUMMARY") current.summary = unescapeIcs(value).trim();
            else if (name.toUpperCase() === "DTSTART") current.start = parseIcsStart(params.join(";"), value);
        }
    }
    return events;
}

// The releases that move markets most; the schedules list many smaller ones too
const MAJOR_RELEASES: Record<"BLS" | "BEA", RegExp[]> = {
    BLS: [/^Employment Situation/i, /^Consumer Price Index/i, /^Producer Price Index/i, /^Job Openings and Labor Turnover/i, /^Employment Cost Index/i, /^Productivity and Costs/i, /^U\.S\. Import and Export Price/i],
    BEA: [/^GDP \(/i, /^Gross Domestic Product,/i, /^Personal Income and Outlays/i, /^U\.S\. International Trade in Goods and Services/i],
};

const RELEASE_PAGES: Record<"BLS" | "BEA", string> = { BLS: "https://www.bls.gov/schedule/news_release/", BEA: "https://www.bea.gov/news/schedule" };

export function parseReleaseSchedule(text: string, source: "BLS" | "BEA"): MarketEvent[] {
    return parseIcs(text)
        .filter((event) => MAJOR_RELEASES[source].some((pattern) => pattern.test(event.summary)))
        .map((event) => ({
            id: `${source.toLowerCase()}|${event.start}|${event.summary}`,
            title: event.summary,
            kind: "data" as const,
            source,
            start: event.start,
            timed: event.timed,
            url: RELEASE_PAGES[source],
        }));
}

// ---------- Selecting and showing ----------

export const EVENTS_AHEAD_DAYS = 30;

// Today's events (including ones already past, so the morning's releases stay in view) through `days` ahead, in
// time order, without repeats
export function upcomingEvents(events: readonly MarketEvent[], now: number, days = EVENTS_AHEAD_DAYS): MarketEvent[] {
    const from = newYorkMs(newYorkClock(now).day, 0);
    const to = now + days * 24 * 60 * 60_000;
    const seen = new Set<string>();
    return events
        .filter((event) => event.start >= from && event.start <= to && !seen.has(event.id) && seen.add(event.id))
        .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

// A fresh answer, keeping the events already shown for any source this answer couldn't load
export function keepFailedSources(previous: EventsResult, next: EventsResult): EventsResult {
    const failed = next.sources.filter((s) => s.issue).map((s) => s.source);
    const keep = previous.events.filter((event) => failed.includes(event.source));
    return keep.length === 0 ? next : { ...next, events: upcomingEvents([...next.events, ...keep], next.checkedAt) };
}

export const filterEvents = (events: readonly MarketEvent[], filter: EventFilter): MarketEvent[] =>
    filter === "all" ? [...events] : events.filter((event) => (filter === "fed" ? event.source === "Federal Reserve" : event.source !== "Federal Reserve"));

// Events grouped by New York day: "Today", "Tomorrow", then "Thu, Oct 15"
export function groupEventsByDay(events: readonly MarketEvent[], now: number): { day: string; label: string; events: MarketEvent[] }[] {
    const today = newYorkClock(now).day;
    const tomorrow = newYorkClock(newYorkMs(today, 0) + 36 * 60 * 60_000).day;
    const groups: { day: string; label: string; events: MarketEvent[] }[] = [];
    for (const event of events) {
        const day = newYorkClock(event.start).day;
        let group = groups.at(-1);
        if (!group || group.day !== day) {
            group = { day, label: day === today ? "Today" : day === tomorrow ? "Tomorrow" : formatNewYorkDay(event.start), events: [] };
            groups.push(group);
        }
        group.events.push(event);
    }
    return groups;
}

// "8:30 AM" in New York time, or "All day" when the agency gives no time
export const formatEventTime = (event: Pick<MarketEvent, "start" | "timed">) => (event.timed ? formatNewYorkTime(event.start) : "All day");
