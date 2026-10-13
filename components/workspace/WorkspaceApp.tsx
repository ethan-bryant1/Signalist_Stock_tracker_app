'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { Check, Copy, LayoutGrid, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { ToolButton } from "@/components/ToolButton";
import SymbolField from "@/components/workspace/SymbolField";
import WidgetFrame from "@/components/workspace/WidgetFrame";
import { WIDGET_CONTENT } from "@/components/workspace/widgets";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveWorkspaceStore } from "@/lib/actions/workspace.actions";
import {
    GRID_COLS,
    GRID_MARGIN,
    MAX_WIDGETS,
    MAX_WORKSPACES,
    ROW_HEIGHT,
    TEMPLATES,
    TEMPLATE_IDS,
    WIDGETS,
    WIDGET_TYPES,
    activeWorkspace,
    addWidget,
    addWorkspace,
    deleteWorkspace,
    duplicateWorkspace,
    moveWidget,
    parseStore,
    readingOrder,
    removeWidget,
    renameWorkspace,
    replaceWorkspace,
    resetWorkspace,
    resizeWidget,
    updateWidget,
    widgetSymbol,
    type LayoutItem,
    type Workspace,
    type WorkspaceStore,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

// The browser keeps a copy too, so a layout survives when the database can't be reached
const LOCAL_KEY = "loops-watch-workspaces";
// Changes the account hasn't confirmed yet; the next visit sends them before anything else
const PENDING_KEY = "loops-watch-workspaces-pending";
const SAVE_DELAY_MS = 800;
// Below this width the widgets stack in one column (no dragging: on a phone, a drag would fight scrolling)
const STACK_BELOW = 768;
const STACKED_MAX = 620;
// Stacked on a phone, a list (quotes, news, sectors) grows to fit its rows up to a cap, so short lists don't scroll
// inside a box; charts and maps keep their grid height
const stackedStyle = (h: number, fitsContent: boolean): CSSProperties =>
    fitsContent
        ? { maxHeight: STACKED_MAX + 100, display: "flex", flexDirection: "column" }
        : { height: Math.min(Math.max(h * ROW_HEIGHT + (h - 1) * GRID_MARGIN, 220), STACKED_MAX) };

type SaveState = "saved" | "saving" | "local" | "failed";

const SAVE_TEXT: Record<SaveState, string> = {
    saved: "Saved",
    saving: "Saving…",
    local: "Saved in this browser only",
    failed: "Couldn't save; kept in this browser",
};

const readLocal = (key = LOCAL_KEY): WorkspaceStore | undefined => {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? parseStore(JSON.parse(raw)) : undefined;
    } catch {
        return undefined;
    }
};

const writeLocal = (store: WorkspaceStore, key = LOCAL_KEY) => {
    try {
        window.localStorage.setItem(key, JSON.stringify(store));
    } catch {
        // Private windows and full storage: the database copy still saves
    }
};

const clearPending = () => {
    try {
        window.localStorage.removeItem(PENDING_KEY);
    } catch {
        // Nothing to clear
    }
};

const sameLayout = (a: readonly LayoutItem[], b: readonly LayoutItem[]) =>
    a.length === b.length && a.every((item) => {
        const other = b.find((entry) => entry.i === item.i);
        return other && other.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h;
    });

// Mosaic-style workspaces: tabs of saved layouts, each a grid of widgets that can be added, removed, dragged and
// resized while editing, with one linked symbol. Saved to the account (MongoDB) and to this browser.
const WorkspaceApp = ({ initialStore, source }: { initialStore: WorkspaceStore; source: "account" | "default" | "unavailable" }) => {
    const [store, setStore] = useState(initialStore);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>(source === "unavailable" ? "local" : "saved");
    const { width, containerRef, mounted } = useContainerWidth();
    // The latest store, so a change and its save use the same value
    const storeRef = useRef(store);
    const saveTimer = useRef<number | undefined>(undefined);
    const unsent = useRef<WorkspaceStore | null>(null);
    // One account save at a time, in order, so an older layout can never land after a newer one
    const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
    const accountReachable = useRef(source !== "unavailable");

    const workspace = activeWorkspace(store);

    const sendToAccount = useCallback((next: WorkspaceStore) => {
        unsent.current = null;
        saveQueue.current = saveQueue.current.then(() =>
            saveWorkspaceStore(next)
                .then(({ ok }) => {
                    // A newer edit keeps its own pending copy and save
                    if (storeRef.current !== next) return;
                    if (ok) clearPending();
                    setSaveState(ok ? "saved" : "failed");
                })
                .catch(() => {
                    if (storeRef.current === next) setSaveState("failed");
                })
        );
    }, []);

    // Saves after changes settle: to the account when it can, and always to this browser
    const persist = useCallback(
        (next: WorkspaceStore) => {
            writeLocal(next);
            window.clearTimeout(saveTimer.current);
            if (!accountReachable.current) {
                setSaveState("local");
                return;
            }
            writeLocal(next, PENDING_KEY);
            unsent.current = next;
            setSaveState("saving");
            saveTimer.current = window.setTimeout(() => sendToAccount(next), SAVE_DELAY_MS);
        },
        [sendToAccount]
    );

    const update = useCallback(
        (change: (current: WorkspaceStore) => WorkspaceStore) => {
            const next = change(storeRef.current);
            if (next === storeRef.current) return;
            storeRef.current = next;
            setStore(next);
            persist(next);
        },
        [persist]
    );

    const updateWorkspace = useCallback((change: (current: Workspace) => Workspace) => update((current) => replaceWorkspace(current, change(activeWorkspace(current)))), [update]);

    // Without an account copy, this browser's copy (if any) takes over once the page has loaded
    // An account copy loses to changes this browser made but couldn't confirm (the page closed or the save failed).
    // Read before any passive effect runs: the grid reports its layout on mount, and that save would overwrite it.
    const pendingAtLoad = useRef<WorkspaceStore | undefined>(undefined);
    useLayoutEffect(() => {
        if (source === "account") pendingAtLoad.current = readLocal(PENDING_KEY);
    }, [source]);
    useEffect(() => {
        const pending = pendingAtLoad.current;
        pendingAtLoad.current = undefined;
        if (!pending) return;
        Promise.resolve().then(() => {
            storeRef.current = pending;
            setStore(pending);
            persist(pending);
        });
    }, [source, persist]);

    useEffect(() => {
        if (source === "account") return;
        const local = readLocal();
        if (!local) return;
        // After the first render, so the server's HTML and the first client render match
        Promise.resolve().then(() => {
            storeRef.current = local;
            setStore(local);
            // An account that has never saved gets this browser's layouts
            if (source === "default") persist(local);
        });
    }, [source, persist]);

    // Leaving the page within the save delay sends the change now instead of dropping it
    useEffect(
        () => () => {
            window.clearTimeout(saveTimer.current);
            if (unsent.current) sendToAccount(unsent.current);
        },
        [sendToAccount]
    );

    const pickSymbol = useCallback((symbol: string) => updateWorkspace((current) => ({ ...current, symbol })), [updateWorkspace]);

    const onLayoutChange = useCallback(
        (layout: Layout) => {
            const next = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
            updateWorkspace((current) => (sameLayout(current.layout, next) ? current : { ...current, layout: current.layout.map((item) => next.find((entry) => entry.i === item.i) ?? item) }));
        },
        [updateWorkspace]
    );

    const gridLayout = useMemo(
        () =>
            workspace.layout.map((item) => {
                const type = workspace.widgets.find((widget) => widget.id === item.i)?.type;
                return { ...item, minW: type ? WIDGETS[type].minW : 1, minH: type ? WIDGETS[type].minH : 1 };
            }),
        [workspace.layout, workspace.widgets]
    );

    const stacked = mounted && width < STACK_BELOW;
    const ordered = useMemo(() => readingOrder(workspace.layout), [workspace.layout]);
    const linkedCount = workspace.widgets.filter((widget) => widget.linked && WIDGETS[widget.type].symbolic).length;

    const frames = (stackedHeight: boolean) =>
        ordered.map((item) => {
            const widget = workspace.widgets.find((entry) => entry.id === item.i);
            if (!widget) return null;
            const symbol = widgetSymbol(workspace, widget);
            const Content = WIDGET_CONTENT[widget.type].component;
            const index = ordered.indexOf(item);
            return (
                <div key={widget.id} style={stackedHeight ? stackedStyle(item.h, WIDGET_CONTENT[widget.type].scroll) : undefined}>
                    <WidgetFrame
                        widget={widget}
                        symbol={symbol}
                        editing={editing && !stackedHeight}
                        canMoveEarlier={index > 0}
                        canMoveLater={index < ordered.length - 1}
                        scroll={WIDGET_CONTENT[widget.type].scroll}
                        onMove={(direction) => updateWorkspace((current) => moveWidget(current, widget.id, direction))}
                        onResize={(dw, dh) => updateWorkspace((current) => resizeWidget(current, widget.id, dw, dh))}
                        onRemove={() => updateWorkspace((current) => removeWidget(current, widget.id))}
                        onLink={(linked) => updateWorkspace((current) => updateWidget(current, widget.id, linked ? { linked: true } : { linked: false, symbol: current.symbol }))}
                        onOwnSymbol={(own) => updateWorkspace((current) => updateWidget(current, widget.id, { symbol: own }))}
                    >
                        <Content symbol={symbol} onPickSymbol={pickSymbol} />
                    </WidgetFrame>
                </div>
            );
        });

    return (
        <div className="flex flex-col gap-4">
            {/* Workspace tabs, the save state and the edit switch */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label="Workspaces" className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-lg border border-gray-600 bg-gray-800 p-0.5">
                    {store.workspaces.map((entry) => {
                        const active = entry.id === workspace.id;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                aria-controls="workspace-grid"
                                onClick={() => {
                                    setConfirmDelete(false);
                                    setRenaming(null);
                                    update((current) => (current.activeId === entry.id ? current : { ...current, activeId: entry.id }));
                                }}
                                className={cn(
                                    "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                    active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                                )}
                            >
                                {entry.name}
                            </button>
                        );
                    })}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            disabled={store.workspaces.length >= MAX_WORKSPACES}
                            aria-label="New workspace"
                            title={store.workspaces.length >= MAX_WORKSPACES ? `Up to ${MAX_WORKSPACES} workspaces` : "New workspace from a template"}
                            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Plus aria-hidden className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-xs text-gray-500">New workspace from a template</DropdownMenuLabel>
                                {TEMPLATE_IDS.map((template) => (
                                    <DropdownMenuItem key={template} onClick={() => update((current) => addWorkspace(current, template))} className="flex cursor-pointer flex-col items-start gap-0.5">
                                        <span className="text-sm font-medium text-gray-100">{TEMPLATES[template].name}</span>
                                        <span className="text-xs text-gray-500">{TEMPLATES[template].description}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-3">
                    <span role="status" className={cn("text-xs", saveState === "failed" ? "font-medium text-gray-100" : "text-gray-500")} title={saveState === "local" ? "The account's database couldn't be reached, so layouts are saved in this browser" : undefined}>
                        {SAVE_TEXT[saveState]}
                    </span>
                    {!stacked && (
                        <ToolButton onClick={() => setEditing((value) => !value)} pressed={editing} title={editing ? "Finish arranging widgets" : "Add, remove, drag and resize widgets"}>
                            {editing ? <Check aria-hidden className="h-3.5 w-3.5" /> : <LayoutGrid aria-hidden className="h-3.5 w-3.5" />}
                            {editing ? "Done" : "Edit layout"}
                        </ToolButton>
                    )}
                </div>
            </div>

            {/* The linked symbol, and the workspace's own actions while editing */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <SymbolField label="Linked symbol" value={workspace.symbol} onCommit={pickSymbol} />
                    <p className="text-xs text-gray-500">
                        {linkedCount > 0 ? `${linkedCount} linked ${linkedCount === 1 ? "widget follows" : "widgets follow"} this symbol. Pick a stock in the watchlist or the Market Snapshot to load it.` : "No widget follows the linked symbol in this workspace."}
                    </p>
                </div>

                {(editing || stacked) && (
                    <div className="flex flex-wrap items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                disabled={workspace.widgets.length >= MAX_WIDGETS}
                                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-gray-100 bg-gray-100 px-3 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Plus aria-hidden className="h-3.5 w-3.5" />
                                Add widget
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
                                <DropdownMenuGroup>
                                    <DropdownMenuLabel className="text-xs text-gray-500">Added at the bottom; drag it into place</DropdownMenuLabel>
                                    {WIDGET_TYPES.map((type) => (
                                        <DropdownMenuItem key={type} onClick={() => updateWorkspace((current) => addWidget(current, type))} className="flex cursor-pointer flex-col items-start gap-0.5">
                                            <span className="text-sm font-medium text-gray-100">
                                                {WIDGETS[type].title} <span className="text-xs font-normal text-gray-500">· {WIDGETS[type].source}</span>
                                            </span>
                                            <span className="text-xs text-gray-500">{WIDGETS[type].description}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {renaming === workspace.id ? (
                            <form
                                className="flex items-center gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const name = new FormData(event.currentTarget).get("name");
                                    update((current) => renameWorkspace(current, workspace.id, String(name ?? "")));
                                    setRenaming(null);
                                }}
                            >
                                <label className="sr-only" htmlFor="workspace-name">
                                    Workspace name
                                </label>
                                <input
                                    id="workspace-name"
                                    name="name"
                                    defaultValue={workspace.name}
                                    maxLength={40}
                                    autoFocus
                                    onKeyDown={(event) => event.key === "Escape" && setRenaming(null)}
                                    className="h-8 w-44 rounded-lg border border-gray-600 bg-gray-900 px-2 text-xs text-gray-100 outline-none focus:border-gray-400"
                                />
                                <ToolButton title="Save the name" type="submit">
                                    Save
                                </ToolButton>
                            </form>
                        ) : (
                            <ToolButton title="Rename this workspace" onClick={() => setRenaming(workspace.id)}>
                                <Pencil aria-hidden className="h-3.5 w-3.5" />
                                Rename
                            </ToolButton>
                        )}
                        <ToolButton title="Copy this workspace into a new tab" disabled={store.workspaces.length >= MAX_WORKSPACES} onClick={() => update((current) => duplicateWorkspace(current, workspace.id))}>
                            <Copy aria-hidden className="h-3.5 w-3.5" />
                            Duplicate
                        </ToolButton>
                        <ToolButton title={`Put back the ${TEMPLATES[workspace.template].name} template's widgets and layout`} onClick={() => update((current) => resetWorkspace(current, workspace.id))}>
                            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                            Reset
                        </ToolButton>
                        {store.workspaces.length > 1 &&
                            (confirmDelete ? (
                                <ToolButton
                                    title="Delete this workspace for good"
                                    pressed
                                    onClick={() => {
                                        setConfirmDelete(false);
                                        update((current) => deleteWorkspace(current, workspace.id));
                                    }}
                                >
                                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                                    Confirm delete
                                </ToolButton>
                            ) : (
                                <ToolButton title="Delete this workspace" onClick={() => setConfirmDelete(true)}>
                                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                                    Delete
                                </ToolButton>
                            ))}
                    </div>
                )}
            </div>

            <div id="workspace-grid" role="tabpanel" aria-label={workspace.name} ref={containerRef} className={cn("ws-grid min-h-[200px]", editing && "ws-editing", busy && "ws-busy")}>
                {workspace.widgets.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-600 px-6 py-16 text-center">
                        <p className="text-sm text-gray-400">This workspace has no widgets.</p>
                        <p className="text-xs text-gray-500">{stacked ? "Add one above, or reset the workspace to its template." : "Choose Edit layout, then Add widget, or reset the workspace to its template."}</p>
                    </div>
                ) : !mounted ? (
                    // Until the grid knows its width: room for the first widgets, so the page doesn't jump
                    <div aria-hidden className="h-[600px] animate-pulse rounded-xl bg-gray-800 motion-reduce:animate-none" />
                ) : stacked ? (
                    <div className="flex flex-col gap-3">{frames(true)}</div>
                ) : (
                    <ReactGridLayout
                        width={width}
                        layout={gridLayout}
                        gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [GRID_MARGIN, GRID_MARGIN], containerPadding: [0, 0] }}
                        dragConfig={{ enabled: editing, handle: ".ws-drag-handle", cancel: "button, input, a, .ws-no-drag" }}
                        resizeConfig={{ enabled: editing, handles: ["se", "e", "s"] }}
                        onLayoutChange={onLayoutChange}
                        onDragStart={() => setBusy(true)}
                        onDragStop={() => setBusy(false)}
                        onResizeStart={() => setBusy(true)}
                        onResizeStop={() => setBusy(false)}
                    >
                        {frames(false)}
                    </ReactGridLayout>
                )}
            </div>

            <p className="text-xs leading-relaxed text-gray-500">
                Finnhub widgets read the app&apos;s shared price cache and load once (reload for newer prices), so they add no polling. TradingView widgets
                use TradingView&apos;s own data, which may be delayed. Charts don&apos;t keep drawings or indicators after a reload: the free embed has no
                way to save them. Up to {MAX_WIDGETS} widgets per workspace and {MAX_WORKSPACES} workspaces.
            </p>
        </div>
    );
};

export default WorkspaceApp;
