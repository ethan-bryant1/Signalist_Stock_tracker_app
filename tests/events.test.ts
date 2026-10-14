import { describe, expect, it } from "vitest";
import {
    filterEvents,
    formatEventTime,
    groupEventsByDay,
    parseClock,
    parseFedCalendar,
    parseIcs,
    parseReleaseSchedule,
    plainText,
    safeUrl,
    upcomingEvents,
    type MarketEvent,
} from "@/lib/events";

// Entries shaped like federalreserve.gov/json/calendar.json (fields as published, October 2026)
const FED = JSON.stringify({
    events: [
        { title: "FOMC Meeting", description: "<p>Two-day meeting, October 27 - 28</p>&#10;&#10;<p>Press Conference</p>", time: "2:00 p.m.", month: "2026-10", days: "28", type: "FOMC" },
        { link: "https://www.federalreserve.gov/live-broadcast.htm", title: "FOMC Press Conference", time: "2:30 p.m.", month: "2026-10", days: "28", type: "FOMC" },
        {
            description: "Economic Outlook",
            live: "https://istanbulef.org/eng/yayin/",
            location: "At the Central Bank of the Republic of T&uuml;rkiye, Istanbul",
            title: "Speech - Governor Christopher J. Waller",
            time: "4:30 a.m.",
            month: "2026-10",
            days: "8",
            type: "Speeches",
        },
        { title: "Testimony - Chair", time: "10:00 a.m.", month: "2026-11", days: "4", type: "Testimony", link: "/newsevents/testimony.htm" },
        { title: "Beige Book", time: "", month: "2026-10", days: "14,15", type: "Beige" },
        { title: "H.15 Selected Interest Rates", time: "4:15 p.m.", month: "2026-10", days: "13", type: "Stat" },
        { title: "Columbus Day", month: "2026-10", days: "12", type: "Other" },
        { title: "Broken", time: "2:00 p.m.", month: "2026-02", days: "30", type: "FOMC" },
        { title: "Bad link", time: "9:00 a.m.", month: "2026-10", days: "20", type: "Speeches", link: "javascript:alert(1)" },
    ],
});

// Shaped like bls.gov's bls.ics and bea.gov's schedule (Eastern-zone local times and UTC times)
const BLS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:1",
    "DTSTART;TZID=US-Eastern:20261014T083000",
    "SUMMARY:Consumer Price Index",
    "LOCATION:Washington\\, DC",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;TZID=US-Eastern:20261106T083000",
    "SUMMARY:Employment Situ",
    " ation",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;TZID=US-Eastern:20261015T100000",
    "SUMMARY:County Employment and Wages",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const BEA = [
    "BEGIN:VEVENT",
    "SUMMARY:GDP (Second Estimate) and Corporate Profits\\, 3rd Quarter 2026",
    "DTSTART:20261125T133000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Personal Income and Outlays\\, October 2026",
    "DTSTART;VALUE=DATE-TIME:20261125T133000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:GDP by State and Personal Income\\, 2nd Quarter 2026",
    "DTSTART:20261001T143000Z",
    "END:VEVENT",
].join("\n");

const NOW = Date.UTC(2026, 9, 13, 23, 0); // Tue Oct 13 2026, 7:00 PM New York

describe("Federal Reserve calendar", () => {
    const events = parseFedCalendar(FED);

    it("keeps FOMC, speeches, testimony and the Beige Book, in Eastern time", () => {
        expect(events.map((e) => e.title)).toEqual([
            "FOMC Meeting",
            "FOMC Press Conference",
            "Governor Christopher J. Waller",
            "Chair",
            "Beige Book",
            "Beige Book",
            "Bad link",
        ]);
        // 2:00 PM EDT on Oct 28 is 18:00 UTC; 10:00 AM EST on Nov 4 (after the clocks change) is 15:00 UTC
        expect(events[0].start).toBe(Date.UTC(2026, 9, 28, 18, 0));
        expect(events[3].start).toBe(Date.UTC(2026, 10, 4, 15, 0));
        expect(events[0]).toMatchObject({ kind: "fomc", source: "Federal Reserve", timed: true, detail: "Two-day meeting, October 27 - 28 Press Conference" });
    });

    it("cleans text and links", () => {
        const speech = events[2];
        expect(speech).toMatchObject({ kind: "speech", format: "Speech", detail: "Economic Outlook", url: "https://istanbulef.org/eng/yayin/" });
        expect(speech.location).toBe("At the Central Bank of the Republic of Türkiye, Istanbul");
        expect(events[3].url).toBe("https://www.federalreserve.gov/newsevents/testimony.htm");
        expect(events[6].url).toBeUndefined();
    });

    it("splits multi-day entries and marks entries without a time", () => {
        const beige = events.filter((e) => e.title === "Beige Book");
        expect(beige.map((e) => formatEventTime(e))).toEqual(["All day", "All day"]);
        expect(new Set(beige.map((e) => e.id)).size).toBe(2);
    });

    it("survives a byte-order mark and rejects anything that isn't the calendar", () => {
        expect(parseFedCalendar(`﻿${FED}`)).toHaveLength(events.length);
        expect(parseFedCalendar("<html>")).toEqual([]);
        expect(parseFedCalendar('{"events": 3}')).toEqual([]);
    });
});

describe("release schedules", () => {
    it("unfolds lines, reads Eastern and UTC times and keeps only the major releases", () => {
        const bls = parseReleaseSchedule(BLS, "BLS");
        expect(bls.map((e) => e.title)).toEqual(["Consumer Price Index", "Employment Situation"]);
        expect(bls[0].start).toBe(Date.UTC(2026, 9, 14, 12, 30)); // 8:30 AM EDT
        expect(bls[1].start).toBe(Date.UTC(2026, 10, 6, 13, 30)); // 8:30 AM EST
        const bea = parseReleaseSchedule(BEA, "BEA");
        expect(bea.map((e) => e.title)).toEqual(["GDP (Second Estimate) and Corporate Profits, 3rd Quarter 2026", "Personal Income and Outlays, October 2026"]);
        expect(formatEventTime(bea[0])).toBe("8:30 AM");
    });

    it("skips events in zones it can't place", () => {
        expect(parseIcs("BEGIN:VEVENT\nSUMMARY:X\nDTSTART;TZID=Europe/Paris:20261014T083000\nEND:VEVENT")).toEqual([]);
        expect(parseIcs("BEGIN:VEVENT\nSUMMARY:X\nDTSTART;VALUE=DATE:20261014\nEND:VEVENT")[0]).toMatchObject({ timed: false });
    });
});

describe("helpers", () => {
    it("parses clock times", () => {
        expect(parseClock("2:00 p.m.")).toBe(14 * 60);
        expect(parseClock("12:15 p.m.")).toBe(12 * 60 + 15);
        expect(parseClock("12:00 a.m.")).toBe(0);
        expect(parseClock("8:30 AM")).toBe(8 * 60 + 30);
        expect(parseClock("")).toBeUndefined();
        expect(parseClock("13:00 p.m.")).toBeUndefined();
    });

    it("strips tags and decodes entities; allows only web links", () => {
        expect(plainText("<p>A &amp; B</p>&#10;<b>C</b>")).toBe("A & B C");
        expect(safeUrl("/x", "https://www.federalreserve.gov/")).toBe("https://www.federalreserve.gov/x");
        expect(safeUrl("data:text/html,hi")).toBeUndefined();
        expect(safeUrl(5)).toBeUndefined();
    });
});

describe("selecting and grouping", () => {
    const all: MarketEvent[] = [...parseFedCalendar(FED), ...parseReleaseSchedule(BLS, "BLS"), ...parseReleaseSchedule(BEA, "BEA")];

    it("lists today through the next 30 days in time order, without repeats", () => {
        const upcoming = upcomingEvents([...all, ...all], NOW);
        // A release with no clock time sorts first in its day
        expect(upcoming.slice(0, 2).map((e) => e.title)).toEqual(["Beige Book", "Consumer Price Index"]);
        expect(upcoming.every((e, i) => i === 0 || upcoming[i - 1].start <= e.start)).toBe(true);
        expect(new Set(upcoming.map((e) => e.id)).size).toBe(upcoming.length);
        // The Oct 8 speech is past; Nov 25 GDP is more than 30 days out
        expect(upcoming.some((e) => e.format === "Speech")).toBe(false);
        expect(upcoming.some((e) => e.title.startsWith("GDP"))).toBe(false);
    });

    it("keeps events from earlier today", () => {
        const morning = Date.UTC(2026, 9, 14, 12, 30);
        expect(upcomingEvents(all, morning + 3 * 60 * 60_000).some((e) => e.title === "Consumer Price Index")).toBe(true);
    });

    it("filters by source and labels days", () => {
        const upcoming = upcomingEvents(all, NOW);
        expect(filterEvents(upcoming, "fed").every((e) => e.source === "Federal Reserve")).toBe(true);
        expect(filterEvents(upcoming, "data").every((e) => e.source !== "Federal Reserve")).toBe(true);
        expect(filterEvents(upcoming, "all")).toHaveLength(upcoming.length);
        const groups = groupEventsByDay(upcoming, NOW);
        expect(groups.slice(0, 2).map((g) => g.label)).toEqual(["Tomorrow", "Thu, Oct 15"]);
        expect(groupEventsByDay(upcoming, Date.UTC(2026, 9, 14, 3, 0))[0].label).toBe("Tomorrow"); // 11 PM in New York
        expect(groupEventsByDay(upcoming, Date.UTC(2026, 9, 14, 13, 0))[0].label).toBe("Today");
    });
});
