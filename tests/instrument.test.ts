import { describe, expect, it } from "vitest";
import { KEY_STATS, KNOWN_FUNDS, instrumentKind } from "@/lib/instrument";
import { SECTOR_ETFS, INDEX_ETFS, MACRO_ETFS } from "@/lib/data/markets";

describe("instrumentKind", () => {
    it("treats a symbol with a company profile as a stock", () => {
        expect(instrumentKind("AAPL", true)).toBe("stock");
    });
    it("treats a known fund without a profile as a fund, whatever the case", () => {
        expect(instrumentKind("SPY", false)).toBe("fund");
        expect(instrumentKind("xlk", false)).toBe("fund");
    });
    it("calls an unknown symbol without a profile 'other' rather than guessing", () => {
        expect(instrumentKind("ARKK", false)).toBe("other");
    });
});

describe("KEY_STATS", () => {
    it("never lists earnings figures for a fund or an unknown listing", () => {
        for (const kind of ["fund", "other"] as const) {
            expect(KEY_STATS[kind]).not.toContain("peRatio");
            expect(KEY_STATS[kind]).not.toContain("eps");
            expect(KEY_STATS[kind]).not.toContain("marketCap");
        }
    });
    it("lists price figures for every kind", () => {
        for (const stats of Object.values(KEY_STATS)) expect(stats.slice(0, 4)).toEqual(["previousClose", "open", "dayRange", "week52Range"]);
    });
});

describe("KNOWN_FUNDS", () => {
    it("covers every fund the app shows in the header, index tiles and sector list", () => {
        for (const { symbol } of [...INDEX_ETFS, ...MACRO_ETFS, ...SECTOR_ETFS]) expect(KNOWN_FUNDS[symbol], symbol).toBeDefined();
    });
});
