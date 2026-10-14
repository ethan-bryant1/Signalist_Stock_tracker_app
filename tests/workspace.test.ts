import { describe, expect, it } from "vitest";
import {
    GRID_COLS,
    MAX_WORKSPACES,
    TEMPLATE_IDS,
    WIDGETS,
    activeWorkspace,
    addWidget,
    addWorkspace,
    compactLayout,
    createWorkspace,
    defaultStore,
    deleteWorkspace,
    duplicateWorkspace,
    moveWidget,
    parseStore,
    readingOrder,
    removeWidget,
    renameWorkspace,
    resetWorkspace,
    resizeWidget,
    uniqueName,
    updateWidget,
    widgetSymbol,
    type LayoutItem,
} from "@/lib/workspace";

const overlapFree = (layout: LayoutItem[]) =>
    layout.every((a, i) => layout.every((b, j) => i === j || !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)));
const inGrid = (layout: LayoutItem[]) => layout.every((item) => item.x >= 0 && item.x + item.w <= GRID_COLS && item.y >= 0 && Number.isInteger(item.y));

describe("templates", () => {
    it.each(TEMPLATE_IDS)("%s has no overlaps, stays in the grid and respects minimum sizes", (template) => {
        const workspace = createWorkspace(template, 1);
        expect(overlapFree(workspace.layout)).toBe(true);
        expect(inGrid(workspace.layout)).toBe(true);
        for (const widget of workspace.widgets) {
            const item = workspace.layout.find((entry) => entry.i === widget.id)!;
            expect(item.w).toBeGreaterThanOrEqual(WIDGETS[widget.type].minW);
            expect(item.h).toBeGreaterThanOrEqual(WIDGETS[widget.type].minH);
        }
    });
    it("links symbol widgets and leaves market-wide ones unlinked", () => {
        const workspace = createWorkspace("technical", 1);
        for (const widget of workspace.widgets) expect(widget.linked).toBe(WIDGETS[widget.type].symbolic);
    });
    it("starts with the three templates, the first active", () => {
        const store = defaultStore(1);
        expect(store.workspaces.map((workspace) => workspace.name)).toEqual(["Market Overview", "Technical Analysis", "Company Research"]);
        expect(activeWorkspace(store).name).toBe("Market Overview");
    });
});

describe("compactLayout", () => {
    it("pulls items up into gaps and pushes overlapping ones down", () => {
        const layout = compactLayout([
            { i: "a", x: 0, y: 5, w: 6, h: 2 },
            { i: "b", x: 0, y: 5, w: 6, h: 3 },
            { i: "c", x: 6, y: 9, w: 6, h: 2 },
        ]);
        expect(layout).toEqual([
            { i: "a", x: 0, y: 0, w: 6, h: 2 },
            { i: "b", x: 0, y: 2, w: 6, h: 3 },
            { i: "c", x: 6, y: 0, w: 6, h: 2 },
        ]);
    });
    it("clamps items that hang off the right edge", () => {
        expect(compactLayout([{ i: "a", x: 10, y: 0, w: 6, h: 2 }])).toEqual([{ i: "a", x: 6, y: 0, w: 6, h: 2 }]);
    });
});

describe("widget operations", () => {
    it("adds a widget at its default size below the others", () => {
        const base = createWorkspace("market", 1);
        const next = addWidget(base, "chart", "new");
        const item = next.layout.find((entry) => entry.i === "new")!;
        expect(item).toMatchObject({ w: WIDGETS.chart.w, h: WIDGETS.chart.h });
        expect(overlapFree(next.layout)).toBe(true);
        expect(next.widgets.at(-1)).toEqual({ id: "new", type: "chart", linked: true });
    });
    it("adds the daily chart linked to the workspace symbol, and keeps it through saving", () => {
        const base = createWorkspace("technical", 1);
        const next = addWidget(base, "dailyChart", "daily");
        expect(next.widgets.at(-1)).toEqual({ id: "daily", type: "dailyChart", linked: true });
        expect(widgetSymbol(next, next.widgets.at(-1)!)).toBe("AAPL");
        const saved = parseStore(JSON.parse(JSON.stringify({ version: 1, activeId: next.id, workspaces: [next] })))!;
        expect(saved.workspaces[0].widgets.at(-1)).toEqual({ id: "daily", type: "dailyChart", linked: true });
        expect(saved.workspaces[0].layout.find((item) => item.i === "daily")).toMatchObject({ w: WIDGETS.dailyChart.w, h: WIDGETS.dailyChart.h });
    });
    it("removes a widget and closes the gap", () => {
        const base = createWorkspace("market", 1);
        const first = readingOrder(base.layout)[0];
        const next = removeWidget(base, first.i);
        expect(next.widgets.some((widget) => widget.id === first.i)).toBe(false);
        expect(Math.min(...next.layout.map((item) => item.y))).toBe(0);
    });
    it("moves a widget earlier or later in reading order", () => {
        const base = createWorkspace("market", 1);
        const order = readingOrder(base.layout).map((item) => item.i);
        const moved = moveWidget(base, order[1], -1);
        const after = readingOrder(moved.layout).map((item) => item.i);
        expect(after[0]).toBe(order[1]);
        expect(after.indexOf(order[1])).toBeLessThan(after.indexOf(order[0]));
        expect(overlapFree(moved.layout)).toBe(true);
        expect(moveWidget(base, order[0], -1)).toBe(base);
    });
    it("resizes within the widget's minimum and the grid", () => {
        const base = createWorkspace("technical", 1);
        const quote = base.widgets.find((widget) => widget.type === "quote")!;
        const shrunk = resizeWidget(base, quote.id, -10, -10);
        expect(shrunk.layout.find((item) => item.i === quote.id)).toMatchObject({ w: WIDGETS.quote.minW, h: WIDGETS.quote.minH });
        const grown = resizeWidget(base, quote.id, 20, 0);
        expect(grown.layout.find((item) => item.i === quote.id)).toMatchObject({ w: GRID_COLS, x: 0 });
        expect(overlapFree(grown.layout)).toBe(true);
    });
    it("unlinked widgets keep their own symbol", () => {
        const base = createWorkspace("technical", 1);
        const chart = base.widgets.find((widget) => widget.type === "chart")!;
        expect(widgetSymbol(base, chart)).toBe("AAPL");
        const unlinked = updateWidget(base, chart.id, { linked: false, symbol: "MSFT" });
        expect(widgetSymbol({ ...unlinked, symbol: "NVDA" }, unlinked.widgets.find((widget) => widget.id === chart.id)!)).toBe("MSFT");
    });
});

describe("store operations", () => {
    it("adds, duplicates, renames and deletes workspaces", () => {
        let store = defaultStore(1);
        store = addWorkspace(store, "research", 2);
        expect(activeWorkspace(store).name).toBe("Company Research 2");
        store = duplicateWorkspace(store, store.activeId, 3);
        expect(activeWorkspace(store).name).toBe("Company Research 2 copy");
        expect(new Set(activeWorkspace(store).widgets.map((widget) => widget.id)).size).toBe(activeWorkspace(store).widgets.length);
        store = renameWorkspace(store, store.activeId, "  My   desk  ");
        expect(activeWorkspace(store).name).toBe("My desk");
        expect(renameWorkspace(store, store.activeId, "   ")).toBe(store);
        const count = store.workspaces.length;
        store = deleteWorkspace(store, store.activeId);
        expect(store.workspaces).toHaveLength(count - 1);
        expect(store.workspaces.some((workspace) => workspace.id === store.activeId)).toBe(true);
    });
    it("never deletes the last workspace or goes past the limit", () => {
        const single = { ...defaultStore(1), workspaces: [createWorkspace("market", 1)] };
        single.activeId = single.workspaces[0].id;
        expect(deleteWorkspace(single, single.activeId)).toBe(single);
        let store = defaultStore(1);
        for (let n = 0; n < 20; n++) store = addWorkspace(store, "market", 10 + n);
        expect(store.workspaces).toHaveLength(MAX_WORKSPACES);
    });
    it("resets a workspace to its template, keeping its name", () => {
        let store = defaultStore(1);
        const id = store.workspaces[1].id;
        store = renameWorkspace(store, id, "Charts");
        const emptied = { ...store, workspaces: store.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, widgets: [], layout: [] } : workspace)) };
        const reset = resetWorkspace(emptied, id, 5).workspaces[1];
        expect(reset.name).toBe("Charts");
        expect(reset.id).toBe(id);
        expect(reset.widgets.map((widget) => widget.type)).toEqual(createWorkspace("technical", 1).widgets.map((widget) => widget.type));
    });
    it("names copies without clashing", () => {
        expect(uniqueName(["A", "A 2"], "A")).toBe("A 3");
        expect(uniqueName([], "A")).toBe("A");
    });
});

describe("parseStore", () => {
    it("round-trips a valid store", () => {
        const store = defaultStore(1);
        expect(parseStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
    });
    it("rejects junk", () => {
        for (const value of [null, 1, "x", {}, { version: 2, workspaces: [] }, { version: 1, workspaces: [] }, { version: 1, workspaces: [{ id: "bad id!" }] }]) {
            expect(parseStore(value)).toBeUndefined();
        }
    });
    it("drops unknown widgets, bad symbols and out-of-range sizes, and fixes the active id", () => {
        const store = parseStore({
            version: 1,
            activeId: "missing",
            workspaces: [
                {
                    id: "ws-1",
                    name: "<b>Desk</b>",
                    symbol: "drop table",
                    widgets: [
                        { id: "a", type: "chart", linked: true, symbol: "javascript:alert(1)" },
                        { id: "b", type: "evil", linked: true },
                        { id: "c", type: "quote", linked: "yes" },
                    ],
                    layout: [
                        { i: "a", x: -4, y: 2, w: 99, h: 1 },
                        { i: "c", x: 0, y: 0, w: 2, h: 2 },
                    ],
                },
            ],
        })!;
        const workspace = store.workspaces[0];
        expect(store.activeId).toBe("ws-1");
        expect(workspace.symbol).toBe("SPY");
        expect(workspace.widgets).toEqual([
            { id: "a", type: "chart", linked: true },
            { id: "c", type: "quote", linked: false },
        ]);
        expect(overlapFree(workspace.layout)).toBe(true);
        expect(inGrid(workspace.layout)).toBe(true);
        expect(workspace.layout.find((item) => item.i === "a")).toMatchObject({ w: WIDGETS.chart.w, h: WIDGETS.chart.minH });
        expect(workspace.layout.find((item) => item.i === "c")).toMatchObject({ w: WIDGETS.quote.minW, h: WIDGETS.quote.minH });
    });
});
