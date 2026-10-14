import { describe, expect, it } from "vitest";
import { SP500_COMPANIES } from "@/lib/data/sp500";
import {
    BUILT_IN_PRESETS,
    DEFAULT_PREFS,
    DEFAULT_STATE,
    FIGURE_LOAD_LIMIT,
    MAX_PRESETS,
    TV_SCREENS,
    TV_VIEWS,
    applyRanges,
    countBySector,
    createPreset,
    deletePreset,
    describeRange,
    describeState,
    industriesIn,
    loadMinutes,
    paramsFromState,
    parsePrefs,
    parseState,
    rangeValue,
    renamePreset,
    sameScreen,
    sp500Matches,
    stateFromParams,
    updatePreset,
    type ScreenState,
} from "@/lib/screener";
import type { WatchRow } from "@/lib/watchlists";

const row = (symbol: string, figures: Partial<WatchRow> = {}): WatchRow => ({ symbol, kind: "stock", currency: "USD", checkedAt: 0, ...figures });
const fromParams = (state: ScreenState) => stateFromParams(Object.fromEntries(paramsFromState(state)));

describe("S&P 500 list", () => {
    it("holds 503 constituents in 11 sectors whose counts add up", () => {
        expect(SP500_COMPANIES).toHaveLength(503);
        const counts = countBySector(SP500_COMPANIES);
        expect(counts.size).toBe(11);
        expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(503);
        expect(counts.get("Information Technology")).toBe(75);
    });

    it("filters by sector, industry and search together", () => {
        const tech = sp500Matches({ sector: "Information Technology", query: "" });
        expect(tech).toHaveLength(75);
        expect(tech.every((company) => company.sector === "Information Technology")).toBe(true);
        const semis = sp500Matches({ sector: "Information Technology", industry: "Semiconductors", query: "" });
        expect(semis.length).toBeGreaterThan(5);
        expect(semis.every((company) => company.industry === "Semiconductors")).toBe(true);
        expect(sp500Matches({ query: "NVDA" })[0].symbol).toBe("NVDA");
        expect(sp500Matches({ sector: "Energy", query: "NVDA" })).toHaveLength(0);
    });

    it("finds tickers with punctuation", () => {
        expect(sp500Matches({ query: "BRK.B" })[0].symbol).toBe("BRK.B");
    });

    it("lists industries of a sector with counts that add up to the sector", () => {
        const energy = industriesIn(SP500_COMPANIES, "Energy");
        expect(energy.reduce((sum, { count }) => sum + count, 0)).toBe(21);
        expect(energy.map(({ industry }) => industry)).toEqual([...energy.map(({ industry }) => industry)].sort((a, b) => a.localeCompare(b)));
    });

    it("estimates load time from the 50-a-minute budget", () => {
        expect(loadMinutes(1)).toBe(1);
        expect(loadMinutes(75)).toBe(5);
        expect(FIGURE_LOAD_LIMIT).toBeLessThanOrEqual(100);
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

    it("swaps a min above its max and drops an industry outside the sector", () => {
        const parsed = parseState({ universe: "sp500", sector: "Energy", industry: "Semiconductors", filters: { price: { min: 10, max: 2 } } });
        expect(parsed.industry).toBeUndefined();
        expect(parsed.filters.price).toEqual({ min: 2, max: 10 });
    });

    it("accepts every TradingView screen and view we offer", () => {
        for (const { value } of TV_SCREENS) expect(parseState({ universe: "us", screen: value }).screen).toBe(value);
        for (const { value } of TV_VIEWS) expect(parseState({ universe: "us", view: value }).view).toBe(value);
    });

    it("round-trips through the address", () => {
        const sp: ScreenState = { ...DEFAULT_STATE, universe: "sp500", sector: "Information Technology", industry: "Semiconductors", query: "micro", filters: { peRatio: { min: 0, max: 30 }, marketCap: { min: 10 } }, sort: { key: "peRatio", dir: "asc" }, columns: ["name", "last", "peRatio"] };
        expect(fromParams(sp)).toEqual(sp);
        const us: ScreenState = { ...DEFAULT_STATE, universe: "us", screen: "top_gainers", view: "performance" };
        expect(fromParams(us)).toEqual(us);
        const wl: ScreenState = { ...DEFAULT_STATE, universe: "watchlist", listId: "abc123", filters: { dividendYield: { min: 2 } } };
        expect(fromParams(wl)).toEqual(wl);
    });

    it("keeps the address short for TradingView screens", () => {
        expect(paramsFromState({ ...DEFAULT_STATE, sector: "Energy" }).toString()).toBe("u=us&screen=most_capitalized&view=overview");
    });

    it("opens the dashboard's ?sector= links on that S&P 500 sector", () => {
        const state = stateFromParams({ sector: "Energy" });
        expect(state).toMatchObject({ universe: "sp500", sector: "Energy", query: "", filters: {} });
        expect(stateFromParams({})).toBeNull();
        expect(stateFromParams({ sector: "Nope" })?.sector).toBeUndefined();
    });

    it("describes a screen in one line", () => {
        expect(describeState({ ...DEFAULT_STATE, universe: "us", screen: "top_gainers", view: "performance" })).toBe("All US · Top gainers · Performance");
        expect(describeState({ ...DEFAULT_STATE, universe: "sp500", sector: "Energy", query: "oil", filters: { price: { min: 1 } } })).toBe('S&P 500 · Energy · "oil" · 1 figure filter');
        expect(describeState({ ...DEFAULT_STATE, universe: "watchlist" }, "Tech")).toBe("Watchlist: Tech");
    });
});

describe("presets", () => {
    it("ships real, distinct ready-made screens", () => {
        expect(new Set(BUILT_IN_PRESETS.map((preset) => preset.id)).size).toBe(BUILT_IN_PRESETS.length);
        for (const preset of BUILT_IN_PRESETS) expect(parseState(preset.state)).toEqual(preset.state);
        const tech = BUILT_IN_PRESETS.find((preset) => preset.id === "builtin-technology")!;
        expect(sp500Matches(tech.state)).toHaveLength(75);
    });

    it("creates, renames, updates and deletes", () => {
        const sp: ScreenState = { ...DEFAULT_STATE, universe: "sp500", sector: "Energy" };
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
                { id: "p1", name: "One", state: { universe: "sp500" } },
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
