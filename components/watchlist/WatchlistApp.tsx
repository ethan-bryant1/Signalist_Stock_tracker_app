"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp, Loader2, Plus, RefreshCw, Search, Star, X } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/components/SearchCommand";
import PageHeader from "@/components/PageHeader";
import { ToolButton } from "@/components/ToolButton";
import ColumnsMenu from "@/components/watchlist/ColumnsMenu";
import InspectPanel from "@/components/watchlist/InspectPanel";
import ListTabs from "@/components/watchlist/ListTabs";
import WatchCards from "@/components/watchlist/WatchCards";
import WatchlistGrid, { type GridRow } from "@/components/watchlist/WatchlistGrid";
import { fetchWatchRows, useWatchRows } from "@/components/watchlist/useWatchRows";
import {
    addWatchlistSymbol,
    createWatchlist,
    deleteWatchlist,
    moveWatchlistSymbol,
    openWatchlist,
    removeWatchlistSymbol,
    renameWatchlist,
    saveWatchlistPrefs,
} from "@/lib/actions/watchlist.actions";
import {
    COLUMNS,
    activeList,
    addItem,
    deleteList,
    filterRows,
    isListSymbol,
    moveItem,
    nextSort,
    normalizeListSymbol,
    removeItem,
    renameList,
    setActiveList,
    setPrefs,
    sortRows,
    type OpResult,
    type SortKey,
    type WatchRow,
    type WatchlistDoc,
    type WatchlistPrefs,
} from "@/lib/watchlists";
import { cn } from "@/lib/utils";

const SAVE_FAILED = "Couldn't save the change. Check your connection and try again.";
const ISSUE_TEXT: Record<string, string> = {
    busy: "Finnhub is busy",
    "rate-limit": "Finnhub's rate limit was reached",
    network: "Finnhub couldn't be reached",
    provider: "Finnhub had an error",
    auth: "the Finnhub key was refused",
    "not-configured": "no Finnhub key is set",
};

// A symbol whose figures haven't arrived is sorted and filtered by what the list knows about it
type ViewRow = WatchRow & { grid: GridRow };
const placeholder = (symbol: string, company: string): WatchRow => ({ symbol, kind: "stock", currency: "USD", name: company, checkedAt: 0 });

// The Watchlist page: tabs of named lists, the quote grid with its own columns and sorting, and the selected stock's
// figures beside it (cards on a phone). Changes show at once and are saved to the account; a failed save is undone
// and said so.
const WatchlistApp = ({ initial, initialRows, description }: { initial: WatchlistDoc; initialRows: WatchRow[]; description: string }) => {
    const router = useRouter();
    const ids = useId();
    const [doc, setDoc] = useState(initial);
    // A fresh copy from the server (after the search window adds a stock) replaces the shown one
    const [seen, setSeen] = useState(initial);
    if (seen !== initial) {
        setSeen(initial);
        setDoc(initial);
    }
    const [selected, setSelected] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [renaming, setRenaming] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [addText, setAddText] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const latest = useRef(0);
    // The newest copy, for changes started from an older render (Undo in a toast)
    const docRef = useRef(doc);
    useLayoutEffect(() => {
        docRef.current = doc;
    }, [doc]);
    const show = (next: WatchlistDoc) => {
        docRef.current = next;
        setDoc(next);
    };
    const addInput = useRef<HTMLInputElement>(null);

    const list = activeList(doc);
    const prefs = doc.prefs;
    const symbols = useMemo(() => list.items.map((item) => item.symbol), [list.items]);
    const { rows, put, load, loadFigures, loading, error } = useWatchRows(symbols, initialRows);

    // Applies a change here at once, saves it, then shows the saved copy. If saving fails the change is undone.
    const commit = async (apply: ((current: WatchlistDoc) => OpResult) | null, save: () => Promise<OpResult>): Promise<WatchlistDoc | null> => {
        const before = docRef.current;
        if (apply) {
            const local = apply(before);
            if (!local.ok) {
                toast.error(local.error);
                return null;
            }
            show(local.doc);
        }
        const ticket = ++latest.current;
        const result: OpResult = await save().catch(() => ({ ok: false as const, error: SAVE_FAILED }));
        if (!result.ok) {
            toast.error(result.error);
            // Undo this change, or reload when later changes were made on top of it
            if (ticket === latest.current) show(before);
            else router.refresh();
            return null;
        }
        if (ticket === latest.current) show(result.doc);
        return result.doc;
    };

    // ---------- Lists ----------

    const open = (listId: string) => {
        if (listId === list.id) return;
        setSelected(null);
        setFilter("");
        setConfirmDelete(null);
        void commit((current) => setActiveList(current, listId), () => openWatchlist(listId));
    };

    const create = async () => {
        const saved = await commit(null, () => createWatchlist(""));
        if (saved) {
            setSelected(null);
            setFilter("");
            setRenaming(saved.activeId);
        }
    };

    const rename = (listId: string, name: string) => {
        setRenaming(null);
        const current = doc.lists.find((entry) => entry.id === listId);
        if (!current || name.trim() === current.name) return;
        void commit((value) => renameList(value, listId, name), () => renameWatchlist(listId, name));
    };

    const remove = async (listId: string) => {
        const target = doc.lists.find((entry) => entry.id === listId);
        setConfirmDelete(null);
        setSelected(null);
        if (target && (await commit((current) => deleteList(current, listId), () => deleteWatchlist(listId)))) toast(`Deleted ${target.name}`);
    };

    // ---------- Symbols ----------

    const removeSymbol = (symbol: string) => {
        const index = list.items.findIndex((item) => item.symbol === symbol);
        const item = list.items[index];
        if (!item) return;
        const listId = list.id;
        const listName = list.name;
        if (selected === symbol) setSelected(null);
        void commit((current) => removeItem(current, listId, symbol), () => removeWatchlistSymbol(listId, symbol)).then((saved) => {
            if (!saved) return;
            toast(`Removed ${symbol} from ${listName}`, {
                action: {
                    label: "Undo",
                    onClick: () => void commit((current) => addItem(current, listId, item.symbol, item.company, item.addedAt, index), () => addWatchlistSymbol(listId, item.symbol, item.company, index)),
                },
            });
        });
    };

    const moveTo = (symbol: string, toIndex: number) => {
        const listId = list.id;
        void commit((current) => moveItem(current, listId, symbol, toIndex), () => moveWatchlistSymbol(listId, symbol, toIndex));
    };
    const moveBy = (symbol: string, direction: -1 | 1) => {
        const from = list.items.findIndex((item) => item.symbol === symbol);
        if (from !== -1) moveTo(symbol, from + direction);
    };

    const addSymbol = async (raw: string) => {
        const symbol = normalizeListSymbol(raw);
        if (!symbol) return;
        if (!isListSymbol(symbol)) return setAddError(`${raw.trim()} isn't a ticker`);
        if (list.items.some((item) => item.symbol === symbol)) {
            setSelected(symbol);
            return setAddError(`${symbol} is already in ${list.name}`);
        }
        const listId = list.id;
        setAdding(true);
        setAddError(null);
        try {
            // Check Finnhub knows the symbol before saving it; the figures are kept for the grid
            const row = rows[symbol] ?? (await fetchWatchRows([symbol]))[0];
            if (!row || (row.price === undefined && !row.name)) {
                return setAddError(row?.issue ? `Couldn't check ${symbol}: ${ISSUE_TEXT[row.issue] ?? "Finnhub had an error"}. Try again in a moment.` : `Finnhub has no data for ${symbol}`);
            }
            put([row]);
            const company = row.name ?? symbol;
            const saved = await commit((current) => addItem(current, listId, symbol, company, Date.now()), () => addWatchlistSymbol(listId, symbol, company));
            if (saved) {
                setAddText("");
                setSelected(symbol);
                toast.success(`Added ${symbol} to ${activeList(saved).name}`);
            }
        } catch (e) {
            setAddError(e instanceof Error && e.message === "signed-out" ? "Sign in again to add stocks" : `Couldn't check ${symbol}. Try again.`);
        } finally {
            setAdding(false);
        }
    };

    // ---------- Preferences ----------

    const changePrefs = (next: WatchlistPrefs) => void commit((current) => setPrefs(current, next), () => saveWatchlistPrefs(next));
    const sortBy = (key: SortKey) => changePrefs({ ...prefs, sort: nextSort(prefs.sort, key) });

    // ---------- What's shown ----------

    const view = useMemo(() => {
        const all: ViewRow[] = list.items.map((item) => {
            const data = rows[item.symbol];
            return { ...(data ?? placeholder(item.symbol, item.company)), grid: { symbol: item.symbol, company: item.company, data } };
        });
        return sortRows(filterRows(all, filter), prefs.sort).map((row) => row.grid);
    }, [list.items, rows, filter, prefs.sort]);

    // Rows Finnhub didn't fully answer: those without a price are asked for again whole, the rest only for their figures
    const noPrice = list.items.filter((item) => rows[item.symbol]?.issue && rows[item.symbol]?.price === undefined).map((item) => item.symbol);
    const noFigures = list.items.filter((item) => rows[item.symbol]?.figuresIssue && rows[item.symbol]?.price !== undefined).map((item) => item.symbol);
    const incomplete = noPrice.length + noFigures.length;
    const retryIncomplete = () => {
        void load(noPrice, true);
        void loadFigures(noFigures);
    };
    const loaded = list.items.filter((item) => rows[item.symbol]).length;
    const selectedRow = view.find((row) => row.symbol === selected) ?? null;
    const selectedIndex = list.items.findIndex((item) => item.symbol === selected);
    const otherListsFor = (symbol: string) => doc.lists.filter((entry) => entry.id !== list.id && entry.items.some((item) => item.symbol === symbol)).map((entry) => entry.name);
    // Rows move only in the list's own order with nothing filtered out, so a position means the same thing everywhere
    const canMove = prefs.sort.key === "manual" && !filter.trim();
    const deleting = confirmDelete ? doc.lists.find((entry) => entry.id === confirmDelete) : undefined;
    const panelId = `${ids}-list`;
    const showPanel = prefs.panel;

    return (
        <div className="flex flex-col gap-4">
            <PageHeader title="Watchlists" description={description}>
            {/* Add a stock by ticker, or find one by name in the search window */}
            <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
                <form
                    className="flex w-full min-w-0 flex-col gap-1 sm:w-auto"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void addSymbol(addText);
                    }}
                >
                    <div className="flex w-full items-center gap-2">
                        <label htmlFor={`${ids}-add`} className="sr-only">
                            Add a ticker to {list.name}
                        </label>
                        <input
                            ref={addInput}
                            id={`${ids}-add`}
                            value={addText}
                            onChange={(event) => {
                                setAddText(event.target.value.toUpperCase());
                                setAddError(null);
                            }}
                            placeholder="Add ticker, e.g. MSFT"
                            spellCheck={false}
                            autoComplete="off"
                            maxLength={20}
                            aria-invalid={addError ? true : undefined}
                            aria-describedby={addError ? `${ids}-add-error` : undefined}
                            className={cn("h-8 w-full min-w-0 flex-1 rounded-lg border bg-gray-900 px-2.5 sm:w-44 sm:flex-none text-sm font-semibold uppercase text-gray-100 outline-none transition-colors placeholder:font-normal placeholder:normal-case placeholder:text-gray-500 focus:border-gray-400", addError ? "border-gray-100" : "border-gray-600")}
                        />
                        <button
                            type="submit"
                            disabled={adding || !addText.trim()}
                            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-100 px-3 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {adding ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
                            Add stock
                        </button>
                        <ToolButton onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} title={`Search by name; the star adds to ${list.name}`}>
                            <Search aria-hidden className="h-3.5 w-3.5" />
                            Search
                        </ToolButton>
                    </div>
                    <p id={`${ids}-add-error`} role="status" className={cn("min-h-4 text-[11px]", addError ? "font-medium text-gray-100" : "text-gray-500")}>
                        {addError ?? `Adds to ${list.name}. A stock can be in several lists.`}
                    </p>
                </form>
            </div>

            </PageHeader>

            {/* The lists, and what the grid shows */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-800 px-2 py-2">
                <ListTabs
                    lists={doc.lists}
                    activeId={list.id}
                    renaming={renaming}
                    panelId={panelId}
                    onOpen={open}
                    onCreate={() => void create()}
                    onStartRename={setRenaming}
                    onRename={rename}
                    onCancelRename={() => setRenaming(null)}
                    onAskDelete={setConfirmDelete}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`${ids}-filter`} className="sr-only">
                        Filter {list.name}
                    </label>
                    <div className="relative">
                        <input
                            id={`${ids}-filter`}
                            type="search"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="Filter"
                            autoComplete="off"
                            className="h-8 w-36 rounded-lg border border-gray-600 bg-gray-900 px-2.5 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400"
                        />
                    </div>
                    {/* The grid's headings sort on wider screens; a phone picks here */}
                    <div className="flex items-center gap-1 md:hidden">
                        <label htmlFor={`${ids}-sort`} className="sr-only">
                            Sort by
                        </label>
                        <select
                            id={`${ids}-sort`}
                            value={prefs.sort.key}
                            onChange={(event) => changePrefs({ ...prefs, sort: nextSort({ key: "manual", dir: "asc" }, event.target.value as SortKey) })}
                            className="h-8 rounded-lg border border-gray-600 bg-gray-900 px-2 text-xs text-gray-100"
                        >
                            <option value="manual">List order</option>
                            <option value="symbol">Symbol</option>
                            {(["last", "change", "changePercent", "marketCap"] as const).map((key) => (
                                <option key={key} value={key}>
                                    {COLUMNS[key].label}
                                </option>
                            ))}
                        </select>
                        {prefs.sort.key !== "manual" && (
                            <ToolButton onClick={() => sortBy(prefs.sort.key)} title={prefs.sort.dir === "asc" ? "Sorted low to high; tap to flip" : "Sorted high to low; tap to flip"} className="px-2">
                                <ArrowDownUp aria-hidden className="h-3.5 w-3.5" />
                                <span className="sr-only">Flip sort</span>
                            </ToolButton>
                        )}
                    </div>
                    <div className="hidden md:block">
                        <ColumnsMenu prefs={prefs} onChange={changePrefs} />
                    </div>
                    <ToolButton onClick={() => void load(symbols, true)} disabled={loading || symbols.length === 0} title="Ask again for this list's figures (prices less than a minute old come from the cache)">
                        <RefreshCw aria-hidden className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        <span className="hidden sm:inline">Refresh</span>
                    </ToolButton>
                </div>
            </div>

            {deleting && (
                <div role="alertdialog" aria-labelledby={`${ids}-delete`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-400 bg-gray-800 px-4 py-3">
                    <p id={`${ids}-delete`} className="text-sm text-gray-100">
                        Delete “{deleting.name}” and its {deleting.items.length} {deleting.items.length === 1 ? "symbol" : "symbols"}? This can&apos;t be undone. The stocks stay in your other lists.
                    </p>
                    <div className="flex gap-2">
                        <ToolButton onClick={() => setConfirmDelete(null)} title="Keep the list" autoFocus>
                            Cancel
                        </ToolButton>
                        <ToolButton onClick={() => void remove(deleting.id)} title={`Delete ${deleting.name}`} pressed>
                            Delete list
                        </ToolButton>
                    </div>
                </div>
            )}

            {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-sm text-gray-100">
                    {error === "signed-out" ? "Your session ended, so prices can't load. Sign in again." : "Couldn't load prices for some symbols."}
                    {error !== "signed-out" && (
                        <ToolButton onClick={() => void load(symbols)} title="Try loading them again">
                            Retry
                        </ToolButton>
                    )}
                </div>
            )}

            <div id={panelId} role="tabpanel" aria-label={list.name} className={cn("grid items-start gap-4", showPanel && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
                <div className="min-w-0 overflow-hidden rounded-xl border border-gray-600 bg-gray-800">
                    {list.items.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                            <Star aria-hidden className="h-8 w-8 text-gray-500" />
                            <h2 className="text-base font-semibold text-gray-100">{list.name} is empty</h2>
                            <p className="max-w-sm text-sm text-gray-500">Type a ticker above and press Add stock, or search by company name and press the star.</p>
                            <div className="flex gap-2">
                                <ToolButton onClick={() => addInput.current?.focus()} title="Type a ticker to add" pressed>
                                    <Plus aria-hidden className="h-3.5 w-3.5" />
                                    Add stock
                                </ToolButton>
                                <ToolButton onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} title="Search stocks by name">
                                    <Search aria-hidden className="h-3.5 w-3.5" />
                                    Search
                                </ToolButton>
                            </div>
                        </div>
                    ) : view.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                            <p className="text-sm text-gray-400">Nothing in {list.name} matches “{filter.trim()}”.</p>
                            <ToolButton onClick={() => setFilter("")} title="Show the whole list">
                                <X aria-hidden className="h-3.5 w-3.5" />
                                Clear filter
                            </ToolButton>
                        </div>
                    ) : (
                        <>
                            <div className="hidden md:block">
                                <WatchlistGrid
                                    rows={view}
                                    columns={prefs.columns}
                                    sort={prefs.sort}
                                    onSort={sortBy}
                                    density={prefs.density}
                                    selected={selected}
                                    onSelect={setSelected}
                                    onMove={canMove ? moveTo : undefined}
                                    onRemove={removeSymbol}
                                    label={list.name}
                                    maxHeightClass="max-h-[calc(100dvh-17rem)] min-h-24"
                                />
                            </div>
                            <div className="md:hidden">
                                <WatchCards rows={view} selected={selected} onSelect={setSelected} onRemove={removeSymbol} onMove={canMove ? moveBy : undefined} listName={list.name} otherListsFor={otherListsFor} />
                            </div>
                        </>
                    )}
                </div>

                {showPanel && list.items.length > 0 && (
                    <div className={cn("hidden xl:sticky xl:top-24", selectedRow ? "md:block" : "xl:block")}>
                        <InspectPanel
                            row={selectedRow}
                            variant="side"
                            otherLists={selectedRow ? otherListsFor(selectedRow.symbol) : []}
                            onRemove={removeSymbol}
                            onMove={canMove ? moveBy : undefined}
                            canMoveUp={selectedIndex > 0}
                            canMoveDown={selectedIndex !== -1 && selectedIndex < list.items.length - 1}
                            listName={list.name}
                        />
                    </div>
                )}
            </div>

            {list.items.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                    <p className="min-w-0 flex-1">
                        {filter.trim() ? `${view.length} of ${list.items.length}` : list.items.length} {list.items.length === 1 ? "symbol" : "symbols"}
                        {loaded < list.items.length && ` · loading ${list.items.length - loaded}`} · Finnhub figures, each price with its time. A dash means Finnhub has no figure; n/a means it doesn&apos;t apply to a fund.
                    </p>
                    <p className="hidden lg:block" aria-hidden>
                        ↑↓ select · Enter open · Delete remove{canMove ? " · Alt+↑↓ move" : ""}
                    </p>
                    {incomplete > 0 && !loading && (
                        <ToolButton onClick={retryIncomplete} title="Finnhub didn't send some of these rows' figures (busy, rate limit or an error); ask for them again">
                            Retry {incomplete} incomplete {incomplete === 1 ? "row" : "rows"}
                        </ToolButton>
                    )}
                </div>
            )}
        </div>
    );
};

export default WatchlistApp;
