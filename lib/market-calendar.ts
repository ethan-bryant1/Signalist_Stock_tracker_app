// US stock market (NYSE and Nasdaq) trading days from the published holiday rules, with no server or browser APIs.
// Days are New York calendar days written "2026-10-13". Unscheduled closures (a national day of mourning) can't be
// known in advance; Finnhub's market status covers those where the app shows a session.

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (year: number, month: number, date: number) => {
    const d = new Date(Date.UTC(year, month - 1, date));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
// 0 = Sunday … 6 = Saturday
const weekdayOf = (year: number, month: number, date: number) => new Date(Date.UTC(year, month - 1, date)).getUTCDay();

// The nth given weekday of a month (n = -1 for the last one)
const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
    if (n > 0) {
        const first = weekdayOf(year, month, 1);
        return dayOf(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
    }
    const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = weekdayOf(year, month, lastDate);
    return dayOf(year, month, lastDate - ((last - weekday + 7) % 7));
};

// Easter Sunday (Gregorian calendar, anonymous algorithm)
const easter = (year: number) => {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    return { month, date: ((h + l - 7 * m + 114) % 31) + 1 };
};

// A fixed-date holiday moves to Friday when it falls on Saturday and to Monday when it falls on Sunday
const observed = (year: number, month: number, date: number) => {
    const weekday = weekdayOf(year, month, date);
    return dayOf(year, month, date + (weekday === 6 ? -1 : weekday === 0 ? 1 : 0));
};

const holidayCache = new Map<number, Map<string, string>>();

// The exchange holidays in a year, by day
export const marketHolidays = (year: number): ReadonlyMap<string, string> => {
    const cached = holidayCache.get(year);
    if (cached) return cached;
    const holidays = new Map<string, string>();
    // New Year's Day on a Saturday isn't moved to the Friday before (that Friday ends the previous year's trading)
    if (weekdayOf(year, 1, 1) !== 6) holidays.set(observed(year, 1, 1), "New Year's Day");
    holidays.set(nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
    holidays.set(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
    const { month, date } = easter(year);
    holidays.set(dayOf(year, month, date - 2), "Good Friday");
    holidays.set(nthWeekday(year, 5, 1, -1), "Memorial Day");
    if (year >= 2022) holidays.set(observed(year, 6, 19), "Juneteenth");
    holidays.set(observed(year, 7, 4), "Independence Day");
    holidays.set(nthWeekday(year, 9, 1, 1), "Labor Day");
    holidays.set(nthWeekday(year, 11, 4, 4), "Thanksgiving Day");
    holidays.set(observed(year, 12, 25), "Christmas Day");
    holidayCache.set(year, holidays);
    return holidays;
};

const parse = (day: string) => day.split("-").map(Number) as [number, number, number];

export const marketHoliday = (day: string): string | undefined => marketHolidays(parse(day)[0]).get(day);

export const isTradingDay = (day: string) => {
    const [year, month, date] = parse(day);
    const weekday = weekdayOf(year, month, date);
    return weekday !== 0 && weekday !== 6 && !marketHoliday(day);
};

// Minutes after midnight New York time
export const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

// The regular session's close: 1:00 PM on July 3 and Christmas Eve (Monday to Thursday) and the day after
// Thanksgiving, otherwise 4:00 PM
export const closeMinutes = (day: string) => {
    const [year, month, date] = parse(day);
    const weekday = weekdayOf(year, month, date);
    const monToThu = weekday >= 1 && weekday <= 4;
    if (month === 7 && date === 3 && monToThu) return EARLY_CLOSE_MINUTES;
    if (month === 12 && date === 24 && monToThu) return EARLY_CLOSE_MINUTES;
    const thanksgiving = nthWeekday(year, 11, 4, 4);
    if (day === dayOf(year, 11, Number(thanksgiving.slice(8)) + 1)) return EARLY_CLOSE_MINUTES;
    return CLOSE_MINUTES;
};

// The calendar day `offset` days after `day`
export const addDays = (day: string, offset: number) => {
    const [year, month, date] = parse(day);
    return dayOf(year, month, date + offset);
};

// The first trading day on or after `day`
export const nextTradingDay = (day: string) => {
    let next = day;
    // Never more than four days off (a holiday next to a weekend); the bound only guards against bad input
    for (let i = 0; i < 10 && !isTradingDay(next); i++) next = addDays(next, 1);
    return next;
};
