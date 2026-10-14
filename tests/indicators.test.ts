import { describe, expect, it } from "vitest";
import {
    INDICATORS,
    directionOf,
    formatCalendarDay,
    formatIndicatorChange,
    formatIndicatorValue,
    formatPeriod,
    nextReleaseDate,
    parseFredTimestamp,
    parseObservations,
    parseRelease,
    parseReleaseDates,
    parseSeriesInfo,
    summarize,
} from "@/lib/indicators";

const obs = (date: string, value: string) => ({ realtime_start: "2026-10-14", realtime_end: "2026-10-14", date, value });

describe("parseObservations", () => {
    it("drops FRED's missing values and sorts oldest first", () => {
        // FRED's answer with sort_order=desc, as the app asks for it
        const raw = { observations: [obs("2026-10-09", "4.11"), obs("2026-10-08", "."), obs("2026-10-07", "4.13")] };
        expect(parseObservations(raw)).toEqual([
            { date: "2026-10-07", value: 4.13 },
            { date: "2026-10-09", value: 4.11 },
        ]);
    });

    it("drops anything that isn't a date and a finite number, and duplicate dates", () => {
        const raw = {
            observations: [obs("2026-09-01", "3.1"), obs("Sep 2026", "3.0"), obs("2026-08-01", ""), obs("2026-07-01", "abc"), { date: "2026-06-01", value: 3 }, obs("2026-09-01", "9")],
        };
        expect(parseObservations(raw)).toEqual([{ date: "2026-09-01", value: 3.1 }]);
    });

    it("keeps negative values (a negative spread or a month of job losses)", () => {
        expect(parseObservations({ observations: [obs("2026-09-01", "-0.42")] })).toEqual([{ date: "2026-09-01", value: -0.42 }]);
    });

    it("returns nothing for an answer without observations", () => {
        expect(parseObservations(null)).toEqual([]);
        expect(parseObservations({ error_code: 400 })).toEqual([]);
    });
});

describe("summarize", () => {
    it("compares the two newest observations", () => {
        const summary = summarize([
            { date: "2026-07-01", value: 2.9 },
            { date: "2026-08-01", value: 2.94 },
            { date: "2026-09-01", value: 3.01 },
        ]);
        expect(summary.latest).toEqual({ date: "2026-09-01", value: 3.01 });
        expect(summary.previous).toEqual({ date: "2026-08-01", value: 2.94 });
        // 3.01 - 2.94 is 0.0699999... in floating point
        expect(summary.change).toBe(0.07);
    });

    it("has no change with one observation and nothing at all with none", () => {
        expect(summarize([{ date: "2026-09-01", value: 4.3 }])).toEqual({ latest: { date: "2026-09-01", value: 4.3 }, previous: undefined, change: undefined });
        expect(summarize([])).toEqual({ latest: undefined, previous: undefined, change: undefined });
    });

    it("gives the direction of a change", () => {
        expect(directionOf(0.1)).toBe("up");
        expect(directionOf(-12)).toBe("down");
        expect(directionOf(0)).toBe("flat");
        expect(directionOf(undefined)).toBeUndefined();
    });
});

describe("FRED's series details", () => {
    it("reads last_updated with its Central-time offset", () => {
        // 07:44:02 at UTC−5 is 12:44:02 UTC
        expect(parseFredTimestamp("2026-10-03 07:44:02-05")).toBe(Date.UTC(2026, 9, 3, 12, 44, 2));
        expect(parseFredTimestamp("2026-01-15 07:31:01-06")).toBe(Date.UTC(2026, 0, 15, 13, 31, 1));
        expect(parseFredTimestamp("yesterday")).toBeUndefined();
        expect(parseFredTimestamp(undefined)).toBeUndefined();
    });

    it("reads the title, update time and adjustment", () => {
        const raw = {
            seriess: [{ id: "UNRATE", title: "Unemployment Rate", units: "Percent", seasonal_adjustment_short: "SA", last_updated: "2026-10-02 07:47:01-05" }],
        };
        expect(parseSeriesInfo(raw)).toEqual({ title: "Unemployment Rate", units: "Percent", seasonalAdjustment: "SA", lastUpdated: Date.UTC(2026, 9, 2, 12, 47, 1) });
        expect(parseSeriesInfo({})).toEqual({});
    });

    it("reads the release a series belongs to", () => {
        expect(parseRelease({ releases: [{ id: 50, name: "Employment Situation" }] })).toEqual({ id: 50, name: "Employment Situation" });
        expect(parseRelease({ releases: [] })).toBeUndefined();
        expect(parseRelease({ releases: [{ id: "50", name: "Employment Situation" }] })).toBeUndefined();
    });

    it("finds the next release date on or after today, skipping dates a cached calendar still holds", () => {
        const dates = parseReleaseDates({
            release_dates: [
                { release_id: 50, date: "2026-11-06" },
                { release_id: 50, date: "2026-10-02" },
                { release_id: 50, date: "2026-12-04" },
                { release_id: 50, date: "bad" },
            ],
        });
        expect(dates).toEqual(["2026-10-02", "2026-11-06", "2026-12-04"]);
        expect(nextReleaseDate(dates, "2026-10-14")).toBe("2026-11-06");
        expect(nextReleaseDate(dates, "2026-11-06")).toBe("2026-11-06");
        expect(nextReleaseDate(dates, "2026-12-05")).toBeUndefined();
    });
});

describe("labels", () => {
    it("names the period an observation covers", () => {
        expect(formatPeriod("2026-09-01", "monthly")).toBe("Sep 2026");
        expect(formatPeriod("2026-07-01", "quarterly")).toBe("Q3 2026");
        expect(formatPeriod("2026-01-01", "quarterly")).toBe("Q1 2026");
        expect(formatPeriod("2026-10-04", "weekly")).toBe("Week to Oct 4, 2026");
        expect(formatPeriod("2026-10-09", "daily")).toBe("Oct 9, 2026");
        expect(formatPeriod("nope", "daily")).toBe("—");
        expect(formatCalendarDay("2026-11-06")).toBe("Nov 6, 2026");
    });

    it("writes values in each unit and never invents one", () => {
        expect(formatIndicatorValue(4.33, "percent")).toBe("4.33%");
        expect(formatIndicatorValue(-0.4, "points")).toBe("-0.40 pp");
        expect(formatIndicatorValue(254, "thousands")).toBe("254K");
        expect(formatIndicatorValue(1307, "thousands")).toBe("1,307K");
        expect(formatIndicatorValue(218000, "count")).toBe("218K");
        expect(formatIndicatorValue(undefined, "percent")).toBe("—");
        expect(formatIndicatorValue(Number.NaN, "percent")).toBe("—");
    });

    it("writes changes in percentage points for percent series", () => {
        expect(formatIndicatorChange(0.07, "percent")).toBe("+0.07 pp");
        expect(formatIndicatorChange(-0.25, "points")).toBe("−0.25 pp");
        expect(formatIndicatorChange(0, "percent")).toBe("0.00 pp");
        expect(formatIndicatorChange(-45, "thousands")).toBe("−45K");
        expect(formatIndicatorChange(12000, "count")).toBe("+12K");
        expect(formatIndicatorChange(undefined, "count")).toBe("—");
    });
});

describe("the indicator list", () => {
    it("has unique ids and series, and asks FRED for a sensible number of points", () => {
        expect(new Set(INDICATORS.map((indicator) => indicator.id)).size).toBe(INDICATORS.length);
        expect(new Set(INDICATORS.map((indicator) => `${indicator.seriesId}:${indicator.units}`)).size).toBe(INDICATORS.length);
        for (const indicator of INDICATORS) {
            expect(indicator.points).toBeGreaterThanOrEqual(2);
            // FRED's observations endpoint accepts up to 100,000; a year of daily values is enough here
            expect(indicator.points).toBeLessThanOrEqual(300);
        }
    });
});
