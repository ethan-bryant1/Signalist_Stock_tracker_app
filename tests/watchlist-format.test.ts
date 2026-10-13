import { describe, expect, it } from "vitest";
import { MISSING, cellFor, formatVolume, rangePosition } from "@/lib/watchlist-format";
import type { WatchRow } from "@/lib/watchlists";

const stock: WatchRow = {
    symbol: "AAPL",
    kind: "stock",
    name: "Apple Inc",
    currency: "USD",
    price: 230.5,
    change: -1.234,
    changePercent: -0.533,
    marketCap: 3_450_000,
    peRatio: 35.126,
    dividendYield: 0.44,
    avgVolume: 52.3,
    checkedAt: 0,
};
const fund: WatchRow = { symbol: "SPY", kind: "fund", currency: "USD", price: 580, change: 2, changePercent: 0.35, checkedAt: 0 };

describe("watchlist cells", () => {
    it("formats prices, signed changes and ratios with fixed decimals", () => {
        expect(cellFor("last", stock).text).toBe("$230.50");
        expect(cellFor("change", stock)).toEqual({ text: "-1.23", signed: true });
        expect(cellFor("changePercent", stock)).toEqual({ text: "-0.53%", signed: true });
        expect(cellFor("changePercent", fund).text).toBe("+0.35%");
        expect(cellFor("peRatio", stock).text).toBe("35.13");
        expect(cellFor("dividendYield", stock).text).toBe("0.44%");
        expect(cellFor("avgVolume", stock).text).toBe("52.30M");
    });

    it("shows a dash for a missing figure and n/a for one a fund doesn't have", () => {
        expect(cellFor("dayHigh", stock)).toEqual({ text: MISSING, state: "missing" });
        expect(cellFor("marketCap", fund)).toEqual({ text: "n/a", state: "na" });
        expect(cellFor("peRatio", fund)).toEqual({ text: "n/a", state: "na" });
        // A fund still has its own prices
        expect(cellFor("last", fund).text).toBe("$580.00");
    });

    it("never shows a non-finite number", () => {
        expect(cellFor("last", { ...stock, price: Number.NaN }).state).toBe("missing");
        expect(cellFor("peRatio", { ...stock, peRatio: Number.POSITIVE_INFINITY }).state).toBe("missing");
    });
});

describe("formatVolume", () => {
    it("scales millions of shares", () => {
        expect(formatVolume(1234.5)).toBe("1.23B");
        expect(formatVolume(12.345)).toBe("12.35M");
        expect(formatVolume(0.85)).toBe("850.00K");
    });
});

describe("rangePosition", () => {
    it("places the price between low and high, clamped", () => {
        expect(rangePosition(150, 100, 200)).toBe(0.5);
        expect(rangePosition(90, 100, 200)).toBe(0);
        expect(rangePosition(210, 100, 200)).toBe(1);
    });
    it("is undefined without a usable range", () => {
        expect(rangePosition(undefined, 100, 200)).toBeUndefined();
        expect(rangePosition(150, undefined, 200)).toBeUndefined();
        expect(rangePosition(150, 200, 200)).toBeUndefined();
    });
});

describe("figures that didn't load", () => {
    it("marks key figures as not loaded, not as missing, when their request failed", () => {
        const row: WatchRow = { ...stock, peRatio: undefined, avgVolume: undefined, figuresIssue: "busy" };
        expect(cellFor("peRatio", row)).toEqual({ text: MISSING, state: "unloaded" });
        expect(cellFor("avgVolume", row).state).toBe("unloaded");
        // A price is not a key figure
        expect(cellFor("dayHigh", row).state).toBe("missing");
    });
});

describe("withFigures", () => {
    it("fills in key figures and keeps the price", async () => {
        const { withFigures } = await import("@/lib/watchlists");
        const row: WatchRow = { ...stock, peRatio: undefined, figuresIssue: "busy" };
        const next = withFigures(row, { symbol: "AAPL", peRatio: 30, figuresIssue: undefined });
        expect(next.peRatio).toBe(30);
        expect(next.figuresIssue).toBeUndefined();
        expect(next.price).toBe(230.5);
    });
});
