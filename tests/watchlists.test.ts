import { describe, expect, it } from "vitest";
import {
    DEFAULT_PREFS,
    MAX_LISTS,
    addItem,
    allSymbols,
    columnApplies,
    createList,
    deleteList,
    emptyDoc,
    filterRows,
    fromLegacy,
    moveColumn,
    moveItem,
    nextSort,
    parseDoc,
    parsePrefs,
    removeItem,
    renameList,
    setActiveList,
    sortRows,
    toggleColumn,
    type OpResult,
    type WatchRow,
    type WatchlistDoc,
} from "@/lib/watchlists";

const ok = (result: OpResult): WatchlistDoc => {
    if (!result.ok) throw new Error(result.error);
    return result.doc;
};
const symbols = (doc: WatchlistDoc, index = 0) => doc.lists[index].items.map((item) => item.symbol);
const row = (symbol: string, fields: Partial<WatchRow> = {}): WatchRow => ({ symbol, kind: "stock", currency: "USD", checkedAt: 0, ...fields });

describe("migration from the single list", () => {
    it("keeps every saved stock, newest first, once each", () => {
        const doc = fromLegacy(
            [
                { symbol: "aapl", company: "Apple Inc", addedAt: new Date(1000) },
                { symbol: "NVDA", company: "NVIDIA", addedAt: new Date(3000) },
                { symbol: "AAPL", company: "Apple again", addedAt: new Date(500) },
                { symbol: "bad symbol!", addedAt: new Date(2000) },
            ],
            "main"
        );
        expect(doc.lists).toHaveLength(1);
        expect(doc.lists[0].name).toBe("Watchlist");
        expect(symbols(doc)).toEqual(["NVDA", "AAPL"]);
        expect(doc.lists[0].items[1].company).toBe("Apple Inc");
    });

    it("gives an empty list when there was nothing saved", () => {
        expect(symbols(fromLegacy([], "main"))).toEqual([]);
    });
});

describe("list operations", () => {
    const base = () => ok(addItem(ok(addItem(emptyDoc("a"), "a", "AAPL", "Apple", 1)), "a", "NVDA", "NVIDIA", 2));

    it("adds once per list and refuses non-tickers", () => {
        const doc = base();
        expect(symbols(doc)).toEqual(["AAPL", "NVDA"]);
        const again = addItem(doc, "a", "aapl", "Apple", 3);
        expect(again.ok).toBe(false);
        expect(!again.ok && again.error).toContain("already in Watchlist");
        expect(addItem(doc, "a", "$$$", "", 3).ok).toBe(false);
        expect(symbols(ok(addItem(doc, "a", "NASDAQ:msft", "", 3)))).toEqual(["AAPL", "NVDA", "MSFT"]);
    });

    it("lets a symbol sit in several lists", () => {
        const doc = ok(addItem(ok(createList(base(), "Tech", "b")), "b", "AAPL", "Apple", 5));
        expect(symbols(doc, 1)).toEqual(["AAPL"]);
        expect(allSymbols(doc)).toEqual(["AAPL", "NVDA"]);
    });

    it("removes and puts a symbol back where it was", () => {
        const removed = ok(removeItem(base(), "a", "AAPL"));
        expect(symbols(removed)).toEqual(["NVDA"]);
        expect(symbols(ok(addItem(removed, "a", "AAPL", "Apple", 9, 0)))).toEqual(["AAPL", "NVDA"]);
        expect(removeItem(removed, "a", "AAPL").ok).toBe(false);
    });

    it("moves a symbol within the list's own order", () => {
        const doc = ok(addItem(base(), "a", "MSFT", "Microsoft", 3));
        expect(symbols(ok(moveItem(doc, "a", "MSFT", 0)))).toEqual(["MSFT", "AAPL", "NVDA"]);
        expect(symbols(ok(moveItem(doc, "a", "AAPL", 99)))).toEqual(["NVDA", "MSFT", "AAPL"]);
        expect(moveItem(doc, "a", "TSLA", 0).ok).toBe(false);
    });

    it("creates lists with unique names and opens the new one", () => {
        let doc = ok(createList(base(), "Tech", "b"));
        expect(doc.activeId).toBe("b");
        doc = ok(createList(doc, "tech", "c"));
        expect(doc.lists.map((list) => list.name)).toEqual(["Watchlist", "Tech", "tech 2"]);
        doc = ok(createList(doc, "   ", "d"));
        expect(doc.lists[3].name).toBe("New list");
    });

    it("stops at the list limit", () => {
        let doc = emptyDoc("l0");
        for (let i = 1; i < MAX_LISTS; i++) doc = ok(createList(doc, `L${i}`, `l${i}`));
        expect(createList(doc, "One more", "x").ok).toBe(false);
    });

    it("renames, refusing empty and duplicate names", () => {
        const doc = ok(createList(base(), "Tech", "b"));
        expect(ok(renameList(doc, "b", "  Semis  ")).lists[1].name).toBe("Semis");
        expect(renameList(doc, "b", "watchlist").ok).toBe(false);
        expect(renameList(doc, "b", "   ").ok).toBe(false);
        expect(ok(renameList(doc, "b", "TECH")).lists[1].name).toBe("TECH");
    });

    it("deletes a list but never the last one, and moves to a neighbour", () => {
        const doc = ok(createList(ok(createList(base(), "B", "b")), "C", "c"));
        const afterActive = ok(deleteList(ok(setActiveList(doc, "b")), "b"));
        expect(afterActive.lists.map((list) => list.id)).toEqual(["a", "c"]);
        expect(afterActive.activeId).toBe("c");
        expect(ok(deleteList(doc, "a")).activeId).toBe("c");
        expect(deleteList(emptyDoc("solo"), "solo").ok).toBe(false);
    });
});

describe("saved data", () => {
    it("round-trips a valid document", () => {
        const doc = ok(createList(ok(addItem(emptyDoc("a"), "a", "AAPL", "Apple", 1)), "Tech", "b"));
        expect(parseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    });

    it("drops anything unknown or broken", () => {
        const parsed = parseDoc({
            version: 1,
            activeId: "missing",
            lists: [
                { id: "a", name: "Main", items: [{ symbol: "AAPL", company: "Apple", addedAt: 1 }, { symbol: "AAPL" }, { symbol: "<script>" }, null] },
                { id: "a", name: "Duplicate id", items: [] },
                { id: "bad id!", name: "Bad", items: [] },
                { id: "b", name: "", items: [] },
            ],
            prefs: { columns: ["last", "nope", "last"], sort: { key: "evil", dir: "sideways" }, density: "huge", panel: false },
        });
        expect(parsed?.lists.map((list) => list.id)).toEqual(["a"]);
        expect(parsed?.activeId).toBe("a");
        expect(parsed?.lists[0].items.map((item) => item.symbol)).toEqual(["AAPL"]);
        expect(parsed?.prefs).toEqual({ columns: ["last"], sort: { key: "manual", dir: "asc" }, density: "compact", panel: false });
        expect(parseDoc({ version: 2, lists: [] })).toBeUndefined();
        expect(parseDoc("nope")).toBeUndefined();
        expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    });
});

describe("columns and sorting", () => {
    it("shows a column back in its default place and moves columns", () => {
        expect(toggleColumn(["name", "last", "marketCap"], "changePercent")).toEqual(["name", "last", "changePercent", "marketCap"]);
        expect(toggleColumn(["name", "last"], "last")).toEqual(["name"]);
        expect(toggleColumn(["name"], "time")).toEqual(["name", "time"]);
        expect(moveColumn(["name", "last", "time"], "time", -1)).toEqual(["name", "time", "last"]);
        expect(moveColumn(["name", "last"], "name", -1)).toEqual(["name", "last"]);
    });

    it("starts numbers high to low and text A to Z, then flips", () => {
        expect(nextSort({ key: "manual", dir: "asc" }, "changePercent")).toEqual({ key: "changePercent", dir: "desc" });
        expect(nextSort({ key: "manual", dir: "asc" }, "name")).toEqual({ key: "name", dir: "asc" });
        expect(nextSort({ key: "symbol", dir: "asc" }, "symbol")).toEqual({ key: "symbol", dir: "desc" });
    });

    it("sorts with missing figures last in either direction and keeps ties in list order", () => {
        const rows = [row("A", { changePercent: 1 }), row("B"), row("C", { changePercent: 3 }), row("D", { changePercent: 1 })];
        expect(sortRows(rows, { key: "changePercent", dir: "desc" }).map((r) => r.symbol)).toEqual(["C", "A", "D", "B"]);
        expect(sortRows(rows, { key: "changePercent", dir: "asc" }).map((r) => r.symbol)).toEqual(["A", "D", "C", "B"]);
        expect(sortRows(rows, { key: "manual", dir: "desc" }).map((r) => r.symbol)).toEqual(["A", "B", "C", "D"]);
        expect(sortRows([row("b", { name: "beta" }), row("a", { name: "Alpha" })], { key: "name", dir: "asc" }).map((r) => r.symbol)).toEqual(["a", "b"]);
    });

    it("treats company-only figures as not applying to funds", () => {
        expect(columnApplies("peRatio", "fund")).toBe(false);
        expect(columnApplies("peRatio", "stock")).toBe(true);
        expect(columnApplies("last", "fund")).toBe(true);
        const rows = [row("SPY", { kind: "fund", marketCap: 500_000 }), row("AAPL", { marketCap: 3_000_000 })];
        expect(sortRows(rows, { key: "marketCap", dir: "asc" }).map((r) => r.symbol)).toEqual(["AAPL", "SPY"]);
    });

    it("filters by symbol, name or industry", () => {
        const rows = [row("AAPL", { name: "Apple Inc", industry: "Technology" }), row("XOM", { name: "Exxon Mobil", industry: "Energy" })];
        expect(filterRows(rows, "ener").map((r) => r.symbol)).toEqual(["XOM"]);
        expect(filterRows(rows, " aapl ").map((r) => r.symbol)).toEqual(["AAPL"]);
        expect(filterRows(rows, "").length).toBe(2);
    });
});
