// Workspaces: named arrangements of widgets on a 12-column grid, like IBKR Mosaic's layouts. Pure rules only (the
// widget catalog, templates, layout moves and validation of saved data), no server or browser APIs.

export const GRID_COLS = 12;
export const ROW_HEIGHT = 30;
export const GRID_MARGIN = 12;
export const MAX_WORKSPACES = 12;
export const MAX_WIDGETS = 24;
const MAX_ROWS = 400;
const MAX_NAME = 40;

export type WidgetType =
    | "chart"
    | "dailyChart"
    | "quote"
    | "news"
    | "marketNews"
    | "watchlist"
    | "snapshot"
    | "sectors"
    | "indexes"
    | "technicals"
    | "profile"
    | "financials"
    | "headlines"
    | "calendar"
    | "screener"
    | "overview"
    | "indicators";

type CatalogEntry = {
    title: string;
    description: string;
    // Follows the workspace's symbol (or keeps its own when unlinked)
    symbolic: boolean;
    // Where the figures come from, shown under the title
    source: string;
    w: number;
    h: number;
    minW: number;
    minH: number;
};

// Every widget a workspace can hold. Finnhub and FRED widgets read the app's shared cache, so adding one adds no polling;
// TradingView widgets are embeds with TradingView's own (often delayed) data.
export const WIDGETS: Record<WidgetType, CatalogEntry> = {
    chart: { title: "Chart", description: "TradingView's chart with indicators and drawing tools", symbolic: true, source: "TradingView", w: 8, h: 14, minW: 4, minH: 8 },
    dailyChart: { title: "Daily chart", description: "Adjusted daily bars since 2016 with volume and 50/200-day averages", symbolic: true, source: "Alpaca", w: 8, h: 14, minW: 4, minH: 10 },
    quote: { title: "Quote", description: "Price, change and day range with its time", symbolic: true, source: "Finnhub", w: 4, h: 6, minW: 3, minH: 5 },
    news: { title: "Company news", description: "The past week's headlines for the symbol", symbolic: true, source: "Finnhub", w: 4, h: 12, minW: 3, minH: 6 },
    technicals: { title: "Technical rating", description: "TradingView's summary of moving averages and oscillators", symbolic: true, source: "TradingView", w: 4, h: 12, minW: 3, minH: 10 },
    profile: { title: "Profile", description: "What the company or fund does", symbolic: true, source: "TradingView", w: 6, h: 10, minW: 4, minH: 8 },
    financials: { title: "Financials", description: "Income statement, balance sheet and cash flow", symbolic: true, source: "TradingView", w: 8, h: 14, minW: 6, minH: 10 },
    watchlist: { title: "Watchlist", description: "Your saved stocks; pick one to load it into linked widgets", symbolic: false, source: "Finnhub", w: 4, h: 10, minW: 3, minH: 6 },
    snapshot: { title: "Market Snapshot", description: "54 of the largest S&P 500 companies by sector", symbolic: false, source: "Finnhub", w: 8, h: 16, minW: 6, minH: 12 },
    sectors: { title: "Sector ETFs", description: "1-day move of each sector fund", symbolic: false, source: "Finnhub", w: 4, h: 16, minW: 3, minH: 12 },
    indexes: { title: "Indexes", description: "S&P 500, Nasdaq 100, Dow 30 and Russell 2000 funds", symbolic: false, source: "Finnhub", w: 12, h: 7, minW: 6, minH: 7 },
    marketNews: { title: "Market news", description: "Market and M&A headlines with their tickers", symbolic: false, source: "Finnhub", w: 4, h: 14, minW: 3, minH: 6 },
    headlines: { title: "Top stories", description: "Market headlines", symbolic: false, source: "TradingView", w: 4, h: 14, minW: 3, minH: 8 },
    // Keeps the id "calendar" (it was TradingView's economic calendar) so saved workspaces show it without a migration
    calendar: { title: "Upcoming events", description: "FOMC meetings, Fed speakers and the major jobs, inflation and GDP releases", symbolic: false, source: "Fed · BLS · BEA", w: 4, h: 14, minW: 3, minH: 8 },
    screener: { title: "Screener", description: "Markets presets: TradingView's US screener, or a watchlist; a pick loads linked widgets", symbolic: false, source: "TradingView · Finnhub", w: 12, h: 16, minW: 6, minH: 10 },
    overview: { title: "Market overview", description: "Top stocks by sector over the past 12 months", symbolic: false, source: "TradingView", w: 4, h: 16, minW: 3, minH: 12 },
    indicators: { title: "Economic indicators", description: "Rates, inflation, jobs and growth, each with its period", symbolic: false, source: "FRED", w: 4, h: 14, minW: 3, minH: 8 },
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

export type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

export type Widget = {
    id: string;
    type: WidgetType;
    // Follows the workspace's symbol; an unlinked widget keeps its own
    linked: boolean;
    symbol?: string;
};

export type Workspace = {
    id: string;
    name: string;
    // The symbol linked widgets show
    symbol: string;
    // The template it started from, which Reset goes back to
    template: TemplateId;
    widgets: Widget[];
    layout: LayoutItem[];
};

export type WorkspaceStore = {
    version: 1;
    activeId: string;
    workspaces: Workspace[];
};

// Tickers are letters and digits, sometimes with a dot or dash (BRK.B); the same rule as the stock pages
export const isWorkspaceSymbol = (value: unknown): value is string => typeof value === "string" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(value);

export const normalizeSymbol = (value: string) => value.trim().toUpperCase().replace(/^[A-Z]+:/, "");

// ---------- Layout ----------

const overlaps = (a: LayoutItem, b: LayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Reading order: top to bottom, then left to right
export const readingOrder = (layout: readonly LayoutItem[]) => [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

// Pulls every item up as far as it goes without overlapping one placed before it, in reading order, so the grid
// has no gaps or overlaps (the same rule as the drag-and-drop grid's vertical compaction)
export const compactLayout = (layout: readonly LayoutItem[], cols = GRID_COLS): LayoutItem[] => {
    const placed: LayoutItem[] = [];
    for (const item of readingOrder(layout)) {
        const w = Math.min(Math.max(1, item.w), cols);
        const x = Math.min(Math.max(0, item.x), cols - w);
        const next = { ...item, x, w, y: 0 };
        while (placed.some((other) => overlaps(next, other))) next.y += 1;
        placed.push(next);
    }
    // Back in the original order, so React keeps each widget's place in the page
    const byId = new Map(placed.map((item) => [item.i, item]));
    return layout.map((item) => byId.get(item.i)!);
};

const minSize = (widgets: readonly Widget[], id: string) => {
    const type = widgets.find((widget) => widget.id === id)?.type;
    return type ? { minW: WIDGETS[type].minW, minH: WIDGETS[type].minH } : { minW: 1, minH: 1 };
};

// Keyboard and menu moves, for people who don't drag: swap with the widget before or after it in reading order
export const moveWidget = (workspace: Workspace, id: string, direction: -1 | 1): Workspace => {
    const order = readingOrder(workspace.layout);
    const index = order.findIndex((item) => item.i === id);
    const other = order[index + direction];
    if (index < 0 || !other) return workspace;
    const item = order[index];
    const swapped = workspace.layout.map((entry) =>
        entry.i === item.i ? { ...entry, x: other.x, y: other.y } : entry.i === other.i ? { ...entry, x: item.x, y: item.y } : entry
    );
    // Equal rows: nudge so the compaction keeps the swapped order
    return { ...workspace, layout: compactLayout(swapped.map((entry) => (entry.i === item.i && direction < 0 ? { ...entry, y: entry.y - 0.5 } : entry))) };
};

// Wider, narrower, taller or shorter by one grid step, within the widget's minimum and the grid
export const resizeWidget = (workspace: Workspace, id: string, dw: number, dh: number): Workspace => {
    const { minW, minH } = minSize(workspace.widgets, id);
    const layout = workspace.layout.map((item) => {
        if (item.i !== id) return item;
        const w = Math.min(Math.max(minW, item.w + dw), GRID_COLS);
        const h = Math.min(Math.max(minH, item.h + dh), 60);
        return { ...item, w, h, x: Math.min(item.x, GRID_COLS - w) };
    });
    return { ...workspace, layout: compactLayout(layout) };
};

// ---------- Widgets and workspaces ----------

let counter = 0;
// Unique enough for one person's layouts: time plus a counter, so two made in the same millisecond differ
export const newId = (prefix: string, now = Date.now()) => `${prefix}-${now.toString(36)}-${(counter++).toString(36)}`;

// Adds a widget at the bottom of the grid, at its default size
export const addWidget = (workspace: Workspace, type: WidgetType, id = newId("w")): Workspace => {
    if (workspace.widgets.length >= MAX_WIDGETS) return workspace;
    const { w, h, symbolic } = WIDGETS[type];
    const bottom = workspace.layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    return {
        ...workspace,
        widgets: [...workspace.widgets, { id, type, linked: symbolic }],
        layout: compactLayout([...workspace.layout, { i: id, x: 0, y: bottom, w, h }]),
    };
};

export const removeWidget = (workspace: Workspace, id: string): Workspace => ({
    ...workspace,
    widgets: workspace.widgets.filter((widget) => widget.id !== id),
    layout: compactLayout(workspace.layout.filter((item) => item.i !== id)),
});

export const updateWidget = (workspace: Workspace, id: string, change: Partial<Pick<Widget, "linked" | "symbol">>): Workspace => ({
    ...workspace,
    widgets: workspace.widgets.map((widget) => (widget.id === id ? { ...widget, ...change } : widget)),
});

// The symbol a widget shows: the workspace's when linked, else its own (or the workspace's until it has one)
export const widgetSymbol = (workspace: Workspace, widget: Widget) => (widget.linked ? workspace.symbol : widget.symbol ?? workspace.symbol);

// ---------- Templates ----------

export type TemplateId = "market" | "technical" | "research";

type TemplateItem = [WidgetType, number, number, number, number];

export const TEMPLATES: Record<TemplateId, { name: string; description: string; symbol: string; items: TemplateItem[] }> = {
    market: {
        name: "Market Overview",
        description: "Indexes, the Market Snapshot, sectors, watchlist, headlines and upcoming events",
        symbol: "SPY",
        items: [
            ["indexes", 0, 0, 12, 7],
            ["snapshot", 0, 6, 8, 16],
            ["sectors", 8, 6, 4, 16],
            ["watchlist", 0, 22, 4, 12],
            ["headlines", 4, 22, 4, 12],
            ["calendar", 8, 22, 4, 12],
        ],
    },
    technical: {
        name: "Technical Analysis",
        description: "A large chart with the quote, technical rating, watchlist and news for one symbol",
        symbol: "AAPL",
        items: [
            ["chart", 0, 0, 8, 18],
            ["quote", 8, 0, 4, 6],
            ["technicals", 8, 6, 4, 12],
            ["watchlist", 0, 18, 4, 12],
            ["news", 4, 18, 4, 12],
            ["sectors", 8, 18, 4, 12],
        ],
    },
    research: {
        name: "Company Research",
        description: "Quote, profile, financials, chart and news for one company",
        symbol: "AAPL",
        items: [
            ["quote", 0, 0, 4, 6],
            ["profile", 4, 0, 8, 10],
            ["news", 0, 6, 4, 14],
            ["financials", 4, 10, 8, 14],
            ["chart", 0, 24, 8, 14],
            ["technicals", 8, 24, 4, 14],
        ],
    },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export const createWorkspace = (template: TemplateId, now = Date.now(), name?: string): Workspace => {
    const { name: templateName, symbol, items } = TEMPLATES[template];
    const id = newId("ws", now);
    const widgets: Widget[] = [];
    const layout: LayoutItem[] = [];
    items.forEach(([type, x, y, w, h], index) => {
        const widgetId = `${id}-${index}`;
        widgets.push({ id: widgetId, type, linked: WIDGETS[type].symbolic });
        layout.push({ i: widgetId, x, y, w, h });
    });
    return { id, name: cleanName(name) ?? templateName, symbol, template, widgets, layout: compactLayout(layout) };
};

export const defaultStore = (now = Date.now()): WorkspaceStore => {
    const workspaces = TEMPLATE_IDS.map((template, index) => createWorkspace(template, now + index));
    return { version: 1, activeId: workspaces[0].id, workspaces };
};

const cleanName = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const name = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    return name || undefined;
};

// A name not already taken, for duplicates and new workspaces: "Research", "Research 2", ...
export const uniqueName = (names: readonly string[], base: string) => {
    if (!names.includes(base)) return base;
    for (let n = 2; ; n++) if (!names.includes(`${base} ${n}`)) return `${base} ${n}`;
};

// ---------- Store operations ----------

export const activeWorkspace = (store: WorkspaceStore) => store.workspaces.find((workspace) => workspace.id === store.activeId) ?? store.workspaces[0];

export const replaceWorkspace = (store: WorkspaceStore, workspace: Workspace): WorkspaceStore => ({
    ...store,
    workspaces: store.workspaces.map((entry) => (entry.id === workspace.id ? workspace : entry)),
});

export const addWorkspace = (store: WorkspaceStore, template: TemplateId, now = Date.now()): WorkspaceStore => {
    if (store.workspaces.length >= MAX_WORKSPACES) return store;
    const created = createWorkspace(template, now);
    created.name = uniqueName(store.workspaces.map((workspace) => workspace.name), created.name);
    return { ...store, activeId: created.id, workspaces: [...store.workspaces, created] };
};

export const duplicateWorkspace = (store: WorkspaceStore, id: string, now = Date.now()): WorkspaceStore => {
    const source = store.workspaces.find((workspace) => workspace.id === id);
    if (!source || store.workspaces.length >= MAX_WORKSPACES) return store;
    const copyId = newId("ws", now);
    const idMap = new Map(source.widgets.map((widget, index) => [widget.id, `${copyId}-${index}`]));
    const copy: Workspace = {
        id: copyId,
        name: uniqueName(store.workspaces.map((workspace) => workspace.name), `${source.name} copy`.slice(0, MAX_NAME)),
        symbol: source.symbol,
        template: source.template,
        widgets: source.widgets.map((widget) => ({ ...widget, id: idMap.get(widget.id)! })),
        layout: source.layout.map((item) => ({ ...item, i: idMap.get(item.i)! })),
    };
    return { ...store, activeId: copy.id, workspaces: [...store.workspaces, copy] };
};

export const deleteWorkspace = (store: WorkspaceStore, id: string): WorkspaceStore => {
    if (store.workspaces.length <= 1) return store;
    const workspaces = store.workspaces.filter((workspace) => workspace.id !== id);
    return { ...store, workspaces, activeId: store.activeId === id ? workspaces[0].id : store.activeId };
};

export const renameWorkspace = (store: WorkspaceStore, id: string, name: string): WorkspaceStore => {
    const clean = cleanName(name);
    if (!clean) return store;
    return { ...store, workspaces: store.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, name: clean } : workspace)) };
};

// Puts a workspace back to its template's widgets and layout, keeping its name and place
export const resetWorkspace = (store: WorkspaceStore, id: string, now = Date.now()): WorkspaceStore => {
    const current = store.workspaces.find((workspace) => workspace.id === id);
    if (!current) return store;
    const fresh = createWorkspace(current.template, now);
    // New widget ids, so every widget reloads fresh
    const widgetId = (index: number) => `${current.id}-r${now.toString(36)}-${index}`;
    return replaceWorkspace(store, {
        ...fresh,
        id: current.id,
        name: current.name,
        widgets: fresh.widgets.map((widget, index) => ({ ...widget, id: widgetId(index) })),
        layout: fresh.layout.map((item, index) => ({ ...item, i: widgetId(index) })),
    });
};

// ---------- Validation of saved data ----------

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,64}$/.test(value);

const parseWorkspace = (value: unknown): Workspace | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    const name = cleanName(raw.name);
    if (!isId(raw.id) || !name || !Array.isArray(raw.widgets) || !Array.isArray(raw.layout)) return undefined;
    const widgets: Widget[] = [];
    for (const entry of raw.widgets.slice(0, MAX_WIDGETS)) {
        const widget = entry as Record<string, unknown>;
        if (!widget || !isId(widget.id) || typeof widget.type !== "string" || !(widget.type in WIDGETS)) continue;
        if (widgets.some((other) => other.id === widget.id)) continue;
        widgets.push({
            id: widget.id,
            type: widget.type as WidgetType,
            linked: widget.linked === true,
            ...(isWorkspaceSymbol(widget.symbol) ? { symbol: widget.symbol } : {}),
        });
    }
    const layout: LayoutItem[] = [];
    for (const widget of widgets) {
        const item = (raw.layout as unknown[]).find((entry) => (entry as LayoutItem | null)?.i === widget.id) as Record<string, unknown> | undefined;
        const { w: dw, h: dh, minW, minH } = WIDGETS[widget.type];
        const w = isInt(item?.w, 1, GRID_COLS) ? Math.max(minW, item.w as number) : dw;
        const h = isInt(item?.h, 1, 60) ? Math.max(minH, item.h as number) : dh;
        layout.push({ i: widget.id, x: isInt(item?.x, 0, GRID_COLS - 1) ? (item.x as number) : 0, y: isInt(item?.y, 0, MAX_ROWS) ? (item.y as number) : MAX_ROWS, w, h });
    }
    const template = typeof raw.template === "string" && raw.template in TEMPLATES ? (raw.template as TemplateId) : "market";
    return { id: raw.id, name, symbol: isWorkspaceSymbol(raw.symbol) ? raw.symbol : "SPY", template, widgets, layout: compactLayout(layout) };
};

// Saved data from the database or the browser, checked field by field: anything unknown or out of range is dropped
// or set to its default, and nothing saved can break the page. Returns undefined when nothing usable is left.
export const parseStore = (value: unknown): WorkspaceStore | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    if (raw.version !== 1 || !Array.isArray(raw.workspaces)) return undefined;
    const workspaces: Workspace[] = [];
    for (const entry of raw.workspaces.slice(0, MAX_WORKSPACES)) {
        const workspace = parseWorkspace(entry);
        if (workspace && !workspaces.some((other) => other.id === workspace.id)) workspaces.push(workspace);
    }
    if (workspaces.length === 0) return undefined;
    const activeId = workspaces.some((workspace) => workspace.id === raw.activeId) ? (raw.activeId as string) : workspaces[0].id;
    return { version: 1, activeId, workspaces };
};
