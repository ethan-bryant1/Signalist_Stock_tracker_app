import { describe, expect, it } from "vitest";
import {
    BUILT_IN_PRESETS,
    COMPANY_BY_SYMBOL,
    DEFAULT_PREFS,
    DEFAULT_STATE,
    MAX_PRESETS,
    TV_SCREENS,
    TV_VIEWS,
    applyRanges,
    createPreset,
    deletePreset,
    describeRange,
    describeState,
    paramsFromState,
    parsePrefs,
    parseState,
    rangeValue,
    renamePreset,
    sameScreen,
    stateFromParams,
    updatePreset,
    type ScreenState,
} from "@/lib/screener";
import type { WatchRow } from "@/lib/watchlists";

const row = (symbol: string, figures: Partial<WatchRow> = {}): WatchRow => ({ symbol, kind: "stock", currency: "USD", checkedAt: 0, ...figures });
const fromParams = (state: ScreenState) => stateFromParams(Object.fromEntries(paramsFromState(state)));

describe("sectors", () => {
    it("knows an S&P 500 stock's sector without any calls", () => {
        expect(COMPANY_BY_SYMBOL.get("NVDA")?.sector).toBe("Information Technology");
        expect(COMPANY_BY_SYMBOL.get("BRK.B")).toBeDefined();
        expect(COMPANY_BY_SYMBOL.get("NOPE")).toBeUndefined();
    });
});

describe("figure ranges", () => {
    const rows = [
        row("A", { price: 50, marketCap: 20_000, peRatio: 12, dividendYield: 3, avgVolume: 5, changePercent: 1.5 }),
        row("B", { price: 500, marketCap: 3_000_000, peRatio: 40, dividendYield: 0.5, avgVolume: 60, changePercent: -2 }),
        row("C", { price: 20 }),
        row("FUND", { kind: "fund", price: 400, marketCap: 500_000, peRatio: 25 }),
    ];

    it("reads figures in the units people type", () => {
        expect(rangeValue(rows[0], "marketCap")).toBe(20);
        expect(rangeValue(rows[3], "marketCap")).toBeUndefined();
        expect(rangeValue(rows[3], "peRatio")).toBeUndefined();
        expect(rangeValue(row("X", { price: Number.NaN }), "price")).toBeUndefined();
    });

    it("keeps everything with no filters", () => {
        expect(applyRanges(rows, {})).toEqual({ kept: rows, unchecked: 0 });
    });

    it("applies min and max inclusively", () => {
        expect(applyRanges(rows, { price: { min: 50, max: 500 } }).kept.map((r) => r.symbol)).toEqual(["A", "B", "FUND"]);
        expect(applyRanges(rows, { changePercent: { max: 0 } }).kept.map((r) => r.symbol)).toEqual(["B"]);
    });

    it("never passes a row it can't check, and counts it", () => {
        const result = applyRanges(rows, { peRatio: { max: 20 } });
        expect(result.kept.map((r) => r.symbol)).toEqual(["A"]);
        // C has no P/E, FUND has none that applies; B fails
        expect(result.unchecked).toBe(2);
    });

    it("drops a row that fails one filter even if another figure is missing", () => {
        const result = applyRanges(rows, { price: { min: 100 }, peRatio: { max: 50 } });
        expect(result.kept.map((r) => r.symbol)).toEqual(["B"]);
        // C fails price; FUND passes price but has no P/E
        expect(result.unchecked).toBe(1);
    });

    it("describes ranges", () => {
        expect(describeRange("peRatio", { min: 0, max: 20 })).toBe("P/E (TTM) 0× to 20×");
        expect(describeRange("marketCap", { min: 10 })).toBe("Market cap ≥ $10B");
        expect(describeRange("price", { max: 5 })).toBe("Price ≤ $5");
        expect(describeRange("changePercent", { min: -2.5 })).toBe("Day change ≥ -2.5%");
    });
});

describe("state", () => {
    it("falls back to defaults for anything unknown", () => {
        expect(parseState(null)).toEqual(DEFAULT_STATE);
        const parsed = parseState({ universe: "moon", screen: "x", view: "y", sector: "Nope", industry: "Nope", sort: { key: "bad" }, columns: ["bad"], filters: { price: { min: "abc" }, junk: { min: 1 } } });
        expect(parsed).toEqual(DEFAULT_STATE);
    });

    it("swaps a min above its max", () => {
        const parsed = parseState({ universe: "watchlist", filters: { price: { min: 10, max: 2 } } });
        expect(parsed.filters.price).toEqual({ min: 2, max: 10 });
    });

    it("opens saved S&P 500 screens on All US, now that universe is gone", () => {
        const parsed = parseState({ universe: "sp500", sector: "Energy", industry: "Oil, Gas & Consumable Fuels", query: "oil" });
        expect(parsed.universe).toBe("us");
        expect(parsed).not.toHaveProperty("sector");
        expect(parsed).not.toHaveProperty("industry");
    });

    it("accepts every TradingView screen and view we offer", () => {
        for (const { value } of TV_SCREENS) expect(parseState({ universe: "us", screen: value }).screen).toBe(value);
        for (const { value } of TV_VIEWS) expect(parseState({ universe: "us", view: value }).view).toBe(value);
    });

    it("round-trips through the address", () => {
        const wlFull: ScreenState = { ...DEFAULT_STATE, universe: "watchlist", listId: "x1", query: "micro", filters: { peRatio: { min: 0, max: 30 }, marketCap: { min: 10 } }, sort: { key: "peRatio", dir: "asc" }, columns: ["name", "last", "peRatio", "sector"] };
        expect(fromParams(wlFull)).toEqual(wlFull);
        const us: ScreenState = { ...DEFAULT_STATE, universe: "us", screen: "top_gainers", view: "performance" };
        expect(fromParams(us)).toEqual(us);
        const wl: ScreenState = { ...DEFAULT_STATE, universe: "watchlist", listId: "abc123", filters: { dividendYield: { min: 2 } } };
        expect(fromParams(wl)).toEqual(wl);
    });

    it("keeps the address short for TradingView screens", () => {
        expect(paramsFromState({ ...DEFAULT_STATE, query: "x", filters: { price: { min: 1 } } }).toString()).toBe("u=us&screen=most_capitalized&view=overview");
    });

    it("treats old S&P 500 addresses as All US", () => {
        expect(stateFromParams({})).toBeNull();
        // The dashboard's former ?sector= links describe no screen, so the last one used opens
        expect(stateFromParams({ sector: "Energy" })).toBeNull();
        expect(stateFromParams({ u: "sp500", sector: "Energy" })?.universe).toBe("us");
    });

    it("describes a screen in one line", () => {
        expect(describeState({ ...DEFAULT_STATE, universe: "us", screen: "top_gainers", view: "performance" })).toBe("All US · Top gainers · Performance");
        expect(describeState({ ...DEFAULT_STATE, universe: "watchlist", query: "oil", filters: { price: { min: 1 } } }, "Energy")).toBe('Watchlist: Energy · "oil" · 1 figure filter');
        expect(describeState({ ...DEFAULT_STATE, universe: "watchlist" }, "Tech")).toBe("Watchlist: Tech");
    });
});

describe("presets", () => {
    it("ships real, distinct ready-made screens", () => {
        expect(new Set(BUILT_IN_PRESETS.map((preset) => preset.id)).size).toBe(BUILT_IN_PRESETS.length);
        for (const preset of BUILT_IN_PRESETS) expect(parseState(preset.state)).toEqual(preset.state);
        expect(BUILT_IN_PRESETS.every((preset) => preset.state.universe === "us")).toBe(true);
    });

    it("creates, renames, updates and deletes", () => {
        const sp: ScreenState = { ...DEFAULT_STATE, universe: "watchlist", listId: "energy" };
        let result = createPreset(DEFAULT_PREFS, "p1", "  Energy   names ", sp);
        expect(result.ok).toBe(true);
        let prefs = result.ok ? result.prefs : DEFAULT_PREFS;
        expect(prefs.presets[0]).toMatchObject({ id: "p1", name: "Energy names" });
        expect(sameScreen(prefs.presets[0].state, sp)).toBe(true);

        result = renamePreset(prefs, "p1", "Oil");
        prefs = result.ok ? result.prefs : prefs;
        expect(prefs.presets[0].name).toBe("Oil");

        const changed = { ...sp, query: "gas" };
        result = updatePreset(prefs, "p1", changed);
        prefs = result.ok ? result.prefs : prefs;
        expect(prefs.presets[0].state.query).toBe("gas");

        result = deletePreset(prefs, "p1");
        expect(result.ok && result.prefs.presets).toEqual([]);
    });

    it("refuses empty, duplicate and too many names", () => {
        expect(createPreset(DEFAULT_PREFS, "p1", "  ", DEFAULT_STATE).ok).toBe(false);
        expect(createPreset(DEFAULT_PREFS, "p1", "large-cap LEADERS", DEFAULT_STATE).ok).toBe(false);
        const full = { ...DEFAULT_PREFS, presets: Array.from({ length: MAX_PRESETS }, (_, i) => ({ id: `p${i}`, name: `P${i}`, state: DEFAULT_STATE })) };
        expect(createPreset(full, "new", "New", DEFAULT_STATE).ok).toBe(false);
        expect(renamePreset(DEFAULT_PREFS, "missing", "X").ok).toBe(false);
        expect(deletePreset(DEFAULT_PREFS, "missing").ok).toBe(false);
    });

    it("cleans saved preferences", () => {
        const prefs = parsePrefs({
            presets: [
                { id: "p1", name: "One", state: { universe: "watchlist" } },
                { id: "p1", name: "Duplicate id", state: {} },
                { id: "builtin-x", name: "Pretend built-in", state: {} },
                { id: "bad id!", name: "Bad", state: {} },
                { id: "p2", name: "", state: {} },
            ],
            last: { universe: "us", screen: "top_losers" },
            density: "comfortable",
            panel: false,
        });
        expect(prefs.presets.map((preset) => preset.id)).toEqual(["p1"]);
        expect(prefs.last?.screen).toBe("top_losers");
        expect(prefs).toMatchObject({ density: "comfortable", panel: false });
        expect(parsePrefs("junk")).toEqual(DEFAULT_PREFS);
    });
});
