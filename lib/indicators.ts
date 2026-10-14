// Economic indicators from FRED (the St. Louis Fed's free data API). Pure rules only: the list of series, reading
// FRED's answers, and the labels each figure needs. No server or browser APIs, so it's unit tested directly.
//
// Every figure is FRED's own: transformed series (year-over-year inflation, monthly payroll change) use FRED's
// `units` option, so FRED does the arithmetic and the app only compares two of its published values.
// Series from third parties that FRED marks as copyrighted (S&P, ICE BofA, Moody's, Freddie Mac, Michigan) are left
// out on purpose; everything listed comes from US government agencies.

import type { FeedIssue } from "@/lib/market-data";

export type IndicatorGroup = "rates" | "inflation" | "jobs" | "growth";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly";
// How a value is written: a percent, percentage points (a spread), thousands, or a plain count shown in thousands
export type ValueUnit = "percent" | "points" | "thousands" | "count";

export type IndicatorDef = {
    id: string;
    // FRED's series id and the transformation FRED applies (lin = as published, pc1 = percent change from a year
    // ago, pch = percent change from the previous period, chg = change from the previous period)
    seriesId: string;
    units: "lin" | "pc1" | "pch" | "chg";
    group: IndicatorGroup;
    label: string;
    // A few words on what the number is, shown under the label
    measure: string;
    frequency: Frequency;
    unit: ValueUnit;
    // How many of the newest observations to ask for: about a year (two for monthly and quarterly series)
    points: number;
};

export const INDICATOR_GROUPS: { id: IndicatorGroup; label: string }[] = [
    { id: "rates", label: "Rates" },
    { id: "inflation", label: "Inflation" },
    { id: "jobs", label: "Jobs" },
    { id: "growth", label: "Growth and housing" },
];

export const INDICATORS: IndicatorDef[] = [
    { id: "fed-funds", seriesId: "DFF", units: "lin", group: "rates", label: "Fed funds rate", measure: "Effective rate, daily", frequency: "daily", unit: "percent", points: 260 },
    { id: "t-3m", seriesId: "DGS3MO", units: "lin", group: "rates", label: "3-month Treasury", measure: "Constant-maturity yield", frequency: "daily", unit: "percent", points: 260 },
    { id: "t-2y", seriesId: "DGS2", units: "lin", group: "rates", label: "2-year Treasury", measure: "Constant-maturity yield", frequency: "daily", unit: "percent", points: 260 },
    { id: "t-10y", seriesId: "DGS10", units: "lin", group: "rates", label: "10-year Treasury", measure: "Constant-maturity yield", frequency: "daily", unit: "percent", points: 260 },
    { id: "curve", seriesId: "T10Y2Y", units: "lin", group: "rates", label: "10y − 2y spread", measure: "Yield curve, percentage points", frequency: "daily", unit: "points", points: 260 },
    { id: "cpi", seriesId: "CPIAUCSL", units: "pc1", group: "inflation", label: "CPI inflation", measure: "All items, change from a year ago", frequency: "monthly", unit: "percent", points: 25 },
    { id: "core-cpi", seriesId: "CPILFESL", units: "pc1", group: "inflation", label: "Core CPI", measure: "Less food and energy, change from a year ago", frequency: "monthly", unit: "percent", points: 25 },
    { id: "core-pce", seriesId: "PCEPILFE", units: "pc1", group: "inflation", label: "Core PCE prices", measure: "The Fed's target gauge, change from a year ago", frequency: "monthly", unit: "percent", points: 25 },
    { id: "unemployment", seriesId: "UNRATE", units: "lin", group: "jobs", label: "Unemployment rate", measure: "Share of the labor force", frequency: "monthly", unit: "percent", points: 25 },
    { id: "payrolls", seriesId: "PAYEMS", units: "chg", group: "jobs", label: "Nonfarm payrolls", measure: "Jobs added in the month", frequency: "monthly", unit: "thousands", points: 25 },
    { id: "claims", seriesId: "ICSA", units: "lin", group: "jobs", label: "Initial jobless claims", measure: "New claims in the week", frequency: "weekly", unit: "count", points: 53 },
    { id: "gdp", seriesId: "A191RL1Q225SBEA", units: "lin", group: "growth", label: "Real GDP growth", measure: "Quarter's change, annualized", frequency: "quarterly", unit: "percent", points: 12 },
    { id: "retail", seriesId: "RSAFS", units: "pch", group: "growth", label: "Retail sales", measure: "Change from the previous month", frequency: "monthly", unit: "percent", points: 25 },
    { id: "housing", seriesId: "HOUST", units: "lin", group: "growth", label: "Housing starts", measure: "New homes started, annual rate", frequency: "monthly", unit: "thousands", points: 25 },
];

export const indicatorById = (id: string) => INDICATORS.find((indicator) => indicator.id === id);

// The line FRED's terms of use require on any app that uses its API
export const FRED_NOTICE = "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

export const fredSeriesUrl = (seriesId: string) => `https://fred.stlouisfed.org/series/${encodeURIComponent(seriesId)}`;

// ---------- Reading FRED's answers ----------

export type Observation = { date: string; value: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// FRED's observations, oldest first. FRED writes a missing value as "." (a market holiday, a delayed release); those
// are dropped, never filled in. Anything that isn't a date and a finite number is dropped too.
export function parseObservations(raw: unknown): Observation[] {
    const list = (raw as { observations?: unknown } | null)?.observations;
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: Observation[] = [];
    for (const entry of list) {
        const { date, value } = (entry ?? {}) as { date?: unknown; value?: unknown };
        if (typeof date !== "string" || !DATE.test(date) || typeof value !== "string" || value.trim() === "" || value === ".") continue;
        const number = Number(value);
        if (!Number.isFinite(number) || seen.has(date)) continue;
        seen.add(date);
        out.push({ date, value: number });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// FRED's "last_updated" time, like "2026-10-03 07:44:02-05" (Central time with its UTC offset), in milliseconds
export function parseFredTimestamp(text: unknown): number | undefined {
    if (typeof text !== "string") return undefined;
    const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2})(?::?(\d{2}))?$/.exec(text.trim());
    if (!match) return undefined;
    const ms = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4] ?? "00"}`);
    return Number.isFinite(ms) ? ms : undefined;
}

export type SeriesInfo = { title?: string; lastUpdated?: number; units?: string; seasonalAdjustment?: string };

// The parts of FRED's series description the page shows
export function parseSeriesInfo(raw: unknown): SeriesInfo {
    const series = (raw as { seriess?: unknown } | null)?.seriess;
    const first = Array.isArray(series) ? (series[0] as Record<string, unknown> | undefined) : undefined;
    if (!first) return {};
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
    return {
        title: text(first.title),
        lastUpdated: parseFredTimestamp(first.last_updated),
        units: text(first.units),
        seasonalAdjustment: text(first.seasonal_adjustment_short),
    };
}

// The release (FRED's name for a scheduled publication, like "Employment Situation") a series belongs to
export function parseRelease(raw: unknown): { id: number; name: string } | undefined {
    const releases = (raw as { releases?: unknown } | null)?.releases;
    const first = Array.isArray(releases) ? (releases[0] as { id?: unknown; name?: unknown } | undefined) : undefined;
    if (!first || typeof first.id !== "number" || !Number.isInteger(first.id) || typeof first.name !== "string") return undefined;
    return { id: first.id, name: first.name };
}

// A release's dates from FRED's calendar, oldest first
export function parseReleaseDates(raw: unknown): string[] {
    const list = (raw as { release_dates?: unknown } | null)?.release_dates;
    if (!Array.isArray(list)) return [];
    const dates = list
        .map((entry) => (entry as { date?: unknown } | null)?.date)
        .filter((date): date is string => typeof date === "string" && DATE.test(date));
    return [...new Set(dates)].sort();
}

// The first scheduled date on or after today (both New York calendar days, YYYY-MM-DD). A cached calendar can hold
// dates that have since passed, so they're skipped here rather than shown as upcoming.
export const nextReleaseDate = (dates: readonly string[], today: string) => dates.find((date) => date >= today);

// ---------- Figures ----------

export type IndicatorSummary = {
    latest?: Observation;
    previous?: Observation;
    // latest − previous, in the series' own unit (percentage points for a percent series), rounded to hide
    // floating-point noise
    change?: number;
};

const round = (value: number, places: number) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};

export function summarize(observations: readonly Observation[]): IndicatorSummary {
    const latest = observations.at(-1);
    const previous = observations.length > 1 ? observations.at(-2) : undefined;
    return { latest, previous, change: latest && previous ? round(latest.value - previous.value, 6) : undefined };
}

export type Direction = "up" | "down" | "flat";
export const directionOf = (change: number | undefined): Direction | undefined =>
    change === undefined ? undefined : change > 0 ? "up" : change < 0 ? "down" : "flat";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The period an observation covers, from FRED's date (the period's first day; for weekly claims, the week's last day)
export function formatPeriod(date: string, frequency: Frequency): string {
    if (!DATE.test(date)) return "—";
    const [year, month, day] = date.split("-").map(Number);
    const monthName = MONTHS[month - 1];
    if (frequency === "quarterly") return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
    if (frequency === "monthly") return `${monthName} ${year}`;
    if (frequency === "weekly") return `Week to ${monthName} ${day}, ${year}`;
    return `${monthName} ${day}, ${year}`;
}

// A calendar day written for people, like "Nov 6, 2026"
export const formatCalendarDay = (date: string) => (DATE.test(date) ? formatPeriod(date, "daily") : "—");

// A value with its unit: "4.33%", "0.52 pp", "254K", "218K" (claims are a count, shown in thousands)
export function formatIndicatorValue(value: number | undefined, unit: ValueUnit): string {
    if (value === undefined || !Number.isFinite(value)) return "—";
    if (unit === "percent") return `${value.toFixed(2)}%`;
    if (unit === "points") return `${value.toFixed(2)} pp`;
    const thousands = unit === "count" ? value / 1000 : value;
    return `${Math.round(thousands).toLocaleString("en-US")}K`;
}

// A change with its sign, in the unit a reader expects: percentage points for percent series, thousands otherwise
export function formatIndicatorChange(change: number | undefined, unit: ValueUnit): string {
    if (change === undefined || !Number.isFinite(change)) return "—";
    const sign = change > 0 ? "+" : change < 0 ? "−" : "";
    const size = Math.abs(change);
    if (unit === "percent" || unit === "points") return `${sign}${size.toFixed(2)} pp`;
    const thousands = unit === "count" ? size / 1000 : size;
    return `${sign}${Math.round(thousands).toLocaleString("en-US")}K`;
}

// ---------- What the server sends ----------

export type IndicatorReading = {
    id: string;
    // Oldest first; what the trend line draws
    history: Observation[];
    latest?: Observation;
    previous?: Observation;
    change?: number;
    // FRED's own title for the series and when FRED last updated it
    title?: string;
    seasonalAdjustment?: string;
    lastUpdated?: number;
    // The scheduled release and its next date (YYYY-MM-DD), when FRED's calendar has one
    releaseName?: string;
    nextRelease?: string;
    // When we fetched the figures from FRED, and whether that copy is our cached one because FRED couldn't answer
    fetchedAt?: number;
    cached?: boolean;
    // Why the figures are missing or out of date
    issue?: FeedIssue;
};

export type IndicatorsPayload =
    | { configured: false }
    | { configured: true; readings: IndicatorReading[]; generatedAt: number; failed: number; issue?: FeedIssue };
