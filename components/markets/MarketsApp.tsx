"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp, Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { OPEN_SEARCH_EVENT } from "@/components/SearchCommand";
import { ToolButton } from "@/components/ToolButton";
import AddToList from "@/components/markets/AddToList";
import FiltersMenu from "@/components/markets/FiltersMenu";
import PresetsMenu from "@/components/markets/PresetsMenu";
import TvScreener from "@/components/markets/TvScreener";
import { useScreenerTable } from "@/components/markets/useScreenerTable";
import ColumnsMenu from "@/components/watchlist/ColumnsMenu";
import InspectPanel from "@/components/watchlist/InspectPanel";
import WatchCards from "@/components/watchlist/WatchCards";
import WatchlistGrid, { type GridRow } from "@/components/watchlist/WatchlistGrid";
import { saveMarketsPrefs } from "@/lib/actions/markets.actions";
import { MARKET_SECTORS, SP500_COMPANIES } from "@/lib/data/sp500";
import {
    BUILT_IN_PRESETS,
    DEFAULT_SCREEN_COLUMNS,
    FIGURE_LOAD_LIMIT,
    SCREENER_COLUMNS,
    SECTOR_LABEL,
    TV_SCREENS,
    TV_VIEWS,
    UNIVERSES,
    activeRanges,
    countBySector,
    createPreset,
    deletePreset,
    describeRange,
    industriesIn,
    loadMinutes,
    nextScreenSort,
    paramsFromState,
    renamePreset,
    sameScreen,
    searchCompanies,
    stateFromParams,
    updatePreset,
    CALLS_PER_STOCK,
    type MarketsPrefs,
    type Preset,
    type PresetResult,
    type ScreenState,
    type Universe,
} from "@/lib/screener";
import { COLUMNS, type SortKey, type WatchlistDoc } from "@/lib/watchlists";
import { cn } from "@/lib/utils";

const SAVE_DELAY_MS = 800;

// The newest presets in this tab. Back from a stock page can show the page with the props it first loaded with,
// which would bring back presets as they were then (and save over newer ones); this copy outlives that.
let latestPrefs: MarketsPrefs | null = null;
const selectClass = "h-8 min-w-0 rounded-lg border border-gray-600 bg-gray-900 px-2 text-xs text-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100";

const Chip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-500 pr-1 pl-3 text-xs text-gray-100">
        {label}
        <button type="button" onClick={onClear} aria-label={`Remove filter: ${label}`} title="Remove" className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100">
            <X aria-hidden className="h-3 w-3" />
        </button>
    </span>
);

const SectorChip = ({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) => (
    <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
            "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100",
            active ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-100"
        )}
    >
        {label}
        <span className={cn("tabular-nums", active ? "opacity-70" : "text-gray-500")}>{count}</span>
    </button>
);

type Props = {
    initialState: ScreenState;
    initialPrefs: MarketsPrefs;
    prefsAvailable: boolean;
    watchlists: WatchlistDoc | null;
};

// The Markets page: one toolbar over one screener. "All US" is TradingView's screener embed, driven only by the
// settings it documents (screen and column view); "S&P 500" and "Watchlists" are our own table over a list we hold,
// where every filter shown filters the rows shown. The screen is kept in the address (so Back from a stock page
// returns to it) and with the account, along with the user's presets.
const MarketsApp = ({ initialState, initialPrefs, prefsAvailable, watchlists }: Props) => {
    const ids = useId();
    // The address wins over the server's copy: Back from a stock page can reuse the page as first loaded, while the
    // address has followed every change since
    const searchParams = useSearchParams();
    const [state, setState] = useState(() => stateFromParams(Object.fromEntries(searchParams), initialState) ?? initialState);
    const [prefs, setPrefs] = useState(() => latestPrefs ?? initialPrefs);
    const [activeId, setActiveId] = useState<string | null>(() => [...BUILT_IN_PRESETS, ...prefs.presets].find((preset) => sameScreen(preset.state, state))?.id ?? null);
    const [doc, setDoc] = useState(watchlists);
    const [selected, setSelected] = useState<string | null>(null);
    const [findText, setFindText] = useState("");

    const native = state.universe !== "us";
    const table = useScreenerTable(state, doc?.lists ?? null, doc?.activeId, "loops-watch:markets-figures");
    const listName = (id?: string) => doc?.lists.find((list) => list.id === id)?.name;
    const update = (patch: Partial<ScreenState>) => setState((current) => ({ ...current, ...patch }));

    // ---------- Address and saving ----------

    // The address follows the screen without a navigation, so the server isn't asked for the page again
    useEffect(() => {
        const url = `${window.location.pathname}?${paramsFromState(state).toString()}`;
        if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
    }, [state]);

    // The presets and the last screen are one document, saved a moment after changes settle
    const saved = useRef(JSON.stringify({ ...prefs, last: state }));
    useEffect(() => {
        latestPrefs = prefs;
        if (!prefsAvailable) return;
        const body = { ...prefs, last: state };
        const text = JSON.stringify(body);
        if (text === saved.current) return;
        const timer = window.setTimeout(() => {
            saveMarketsPrefs(body)
                .then((result) => {
                    if (result.ok) saved.current = text;
                    else toast.error("Couldn't save your Markets presets. Check your connection.");
                })
                .catch(() => toast.error("Couldn't save your Markets presets. Check your connection."));
        }, SAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [prefs, state, prefsAvailable]);

    // ---------- Presets ----------

    const applyPreset = (preset: Preset) => {
        setState(preset.state);
        setActiveId(preset.id);
        setSelected(null);
    };
    const changePresets = (result: PresetResult): string | null => {
        if (!result.ok) return result.error;
        setPrefs(result.prefs);
        return null;
    };
    const onCreate = (name: string) => {
        const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const problem = changePresets(createPreset(prefs, id, name, state));
        if (!problem) setActiveId(id);
        return problem;
    };

    // ---------- S&P 500 ----------

    const searchMatches = useMemo(() => (state.universe === "sp500" ? searchCompanies(SP500_COMPANIES, state.query) : []), [state.universe, state.query]);
    const sectorCounts = useMemo(() => countBySector(searchMatches), [searchMatches]);
    const industries = useMemo(() => industriesIn(searchMatches, state.sector), [searchMatches, state.sector]);
    // On a narrow screen the sector row scrolls sideways; keep the chosen sector in view
    const sectorRow = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const row = sectorRow.current;
        const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (row && chip && row.scrollWidth > row.clientWidth) row.scrollTo({ left: chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2 });
    }, [state.sector, state.universe]);

    // ---------- Selection ----------

    const selectedRow: GridRow | null = table.rows.find((row) => row.symbol === selected) ?? null;
    const select = (symbol: string | null) => {
        setSelected(symbol);
        // A stock picked before its figures were asked for loads them on its own (one stock, a few calls at most)
        const row = symbol ? table.rows.find((entry) => entry.symbol === symbol) : undefined;
        if (row?.idle) table.request([row.symbol]);
    };
    const actionsFor = (row: GridRow) => (doc ? <AddToList symbol={row.symbol} company={row.data?.name ?? row.company} doc={doc} onSaved={setDoc} /> : null);
    const otherLists = (symbol: string) => (doc ? doc.lists.filter((list) => list.items.some((item) => item.symbol === symbol)).map((list) => list.name) : []);

    // ---------- Text ----------

    const universeWord = state.universe === "sp500" ? "S&P 500 constituents" : `stocks in ${table.list?.name ?? "the list"}`;
    const ranges = activeRanges(state.filters);
    const canLoad = state.universe === "sp500" && table.unrequested.length > 0 && table.total <= FIGURE_LOAD_LIMIT;
    const figuresNote =
        state.universe === "sp500"
            ? "Figures are Finnhub's and load for S&P 500 stocks when you ask (Load figures). A stock whose figure hasn't loaded or doesn't exist isn't shown while a filter on that figure is on; the count below says how many."
            : "Figures are Finnhub's, the same as the Watchlist page's. A stock without the figure isn't shown while a filter on that figure is on; the count below says how many.";
    const sortSelect = ["symbol", "last", "changePercent", "marketCap", "peRatio", "dividendYield", "avgVolume"] as const;

    const findStock = () => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: findText.trim() }));

    return (
        <div className="flex flex-col gap-4">
            <PageHeader
                back={false}
                title="Markets"
                description="Screen stocks and open their research. All US stocks screen in TradingView's screener; the S&P 500 and your watchlists in a Loops Watch table with Finnhub figures."
            >
                <p className="text-xs text-gray-500" aria-live="polite">
                    {native ? "Finnhub figures · each price shows its time (New York)" : "TradingView data · may be delayed · no Finnhub calls"}
                </p>
            </PageHeader>

            {/* Universe, preset and the controls that apply to it */}
            <div className="flex flex-col gap-2 rounded-xl border border-gray-600 bg-gray-800 p-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="radiogroup" aria-label="Stock universe" className="flex shrink-0 rounded-lg border border-gray-600 p-0.5">
                        {UNIVERSES.map(({ value, label, short }) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={state.universe === value}
                                title={label}
                                disabled={value === "watchlist" && !doc}
                                onClick={() => {
                                    update({ universe: value as Universe });
                                    setSelected(null);
                                }}
                                className={cn(
                                    "h-7 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-40",
                                    state.universe === value ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-100"
                                )}
                            >
                                {short}
                            </button>
                        ))}
                    </div>

                    <PresetsMenu
                        state={state}
                        presets={prefs.presets}
                        activeId={activeId}
                        canSave={prefsAvailable}
                        listName={listName}
                        onApply={applyPreset}
                        onCreate={onCreate}
                        onRename={(id, name) => changePresets(renamePreset(prefs, id, name))}
                        onUpdate={(id) => changePresets(updatePreset(prefs, id, state))}
                        onDelete={(id) => {
                            changePresets(deletePreset(prefs, id));
                            if (activeId === id) setActiveId(null);
                        }}
                    />

                    {state.universe === "us" ? (
                        <>
                            <label htmlFor={`${ids}-screen`} className="sr-only">
                                TradingView screen
                            </label>
                            <select id={`${ids}-screen`} value={state.screen} onChange={(event) => update({ screen: event.target.value as ScreenState["screen"] })} title="TradingView's preset screen" className={cn(selectClass, "max-w-48")}>
                                {TV_SCREENS.map((screen) => (
                                    <option key={screen.value} value={screen.value}>
                                        {screen.label}
                                    </option>
                                ))}
                            </select>
                            <label htmlFor={`${ids}-view`} className="sr-only">
                                TradingView columns
                            </label>
                            <select id={`${ids}-view`} value={state.view} onChange={(event) => update({ view: event.target.value as ScreenState["view"] })} title="TradingView's column view" className={cn(selectClass, "max-w-40")}>
                                {TV_VIEWS.map((view) => (
                                    <option key={view.value} value={view.value}>
                                        Columns: {view.label}
                                    </option>
                                ))}
                            </select>
                            <form
                                role="search"
                                className="relative ml-auto flex min-w-0 grow sm:grow-0"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    findStock();
                                }}
                            >
                                <label htmlFor={`${ids}-find`} className="sr-only">
                                    Find a stock (opens search)
                                </label>
                                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                                <input
                                    id={`${ids}-find`}
                                    value={findText}
                                    onChange={(event) => setFindText(event.target.value)}
                                    placeholder="Find any US stock"
                                    title="Opens the search window with this text (Ctrl+K)"
                                    autoComplete="off"
                                    className="h-8 w-full rounded-lg border border-gray-600 bg-gray-900 pr-2 pl-8 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400 sm:w-52"
                                />
                            </form>
                        </>
                    ) : (
                        <>
                            {state.universe === "watchlist" && doc && (
                                <>
                                    <label htmlFor={`${ids}-list`} className="sr-only">
                                        Watchlist
                                    </label>
                                    <select id={`${ids}-list`} value={table.list?.id ?? ""} onChange={(event) => update({ listId: event.target.value })} className={cn(selectClass, "max-w-40")}>
                                        {doc.lists.map((list) => (
                                            <option key={list.id} value={list.id}>
                                                {list.name} ({list.items.length})
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
                            <div className="relative min-w-0 grow sm:grow-0">
                                <label htmlFor={`${ids}-q`} className="sr-only">
                                    Search {universeWord}
                                </label>
                                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                                <input
                                    id={`${ids}-q`}
                                    type="search"
                                    value={state.query}
                                    onChange={(event) => update({ query: event.target.value })}
                                    onKeyDown={(event) => event.key === "Escape" && update({ query: "" })}
                                    placeholder={state.universe === "sp500" ? "Company, ticker or industry" : "Filter this list"}
                                    autoComplete="off"
                                    className="h-8 w-full rounded-lg border border-gray-600 bg-gray-900 pr-2 pl-8 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400 sm:w-56"
                                />
                            </div>
                            <FiltersMenu filters={state.filters} onChange={(filters) => update({ filters })} figuresNote={figuresNote} />
                            <div className="hidden md:block">
                                <ColumnsMenu
                                    prefs={{ columns: state.columns, sort: state.sort, density: prefs.density, panel: prefs.panel }}
                                    onChange={(next) => {
                                        update({ columns: next.columns.length > 0 ? next.columns : DEFAULT_SCREEN_COLUMNS });
                                        setPrefs((current) => ({ ...current, density: next.density, panel: next.panel }));
                                    }}
                                    available={SCREENER_COLUMNS}
                                    defaultColumns={DEFAULT_SCREEN_COLUMNS}
                                />
                            </div>
                            {/* Headings sort on wider screens; a phone picks here */}
                            <div className="flex items-center gap-1 md:hidden">
                                <label htmlFor={`${ids}-sort`} className="sr-only">
                                    Sort by
                                </label>
                                <select id={`${ids}-sort`} value={state.sort.key} onChange={(event) => update({ sort: nextScreenSort({ key: "manual", dir: "asc" }, event.target.value as SortKey) })} className={selectClass}>
                                    {sortSelect.map((key) => (
                                        <option key={key} value={key}>
                                            {key === "symbol" ? "Symbol" : COLUMNS[key].label}
                                        </option>
                                    ))}
                                </select>
                                <ToolButton onClick={() => update({ sort: nextScreenSort(state.sort, state.sort.key) })} title={state.sort.dir === "asc" ? "Sorted low to high; tap to flip" : "Sorted high to low; tap to flip"} className="px-2">
                                    <ArrowDownUp aria-hidden className="h-3.5 w-3.5" />
                                    <span className="sr-only">Flip sort</span>
                                </ToolButton>
                            </div>
                            <ToolButton onClick={table.refresh} disabled={table.loading || table.loaded === 0} title="Ask again for the figures on show (prices under a minute old come from the cache)" className="ml-auto">
                                <RefreshCw aria-hidden className={cn("h-3.5 w-3.5", table.loading && "animate-spin motion-reduce:animate-none")} />
                                <span className="hidden sm:inline">Refresh</span>
                            </ToolButton>
                        </>
                    )}
                </div>

                {state.universe === "sp500" && (
                    <div className="flex flex-col gap-2 border-t border-gray-700 pt-2 lg:flex-row lg:items-center">
                        <div ref={sectorRow} role="group" aria-label="S&P 500 sectors (constituent counts)" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide lg:flex-wrap">
                            <SectorChip label="All sectors" count={searchMatches.length} active={!state.sector} onClick={() => update({ sector: undefined, industry: undefined })} />
                            {MARKET_SECTORS.map(({ value, label }) => (
                                <SectorChip key={value} label={label} count={sectorCounts.get(value) ?? 0} active={state.sector === value} onClick={() => update({ sector: state.sector === value ? undefined : value, industry: undefined })} />
                            ))}
                        </div>
                        <label htmlFor={`${ids}-industry`} className="sr-only">
                            Industry
                        </label>
                        <select id={`${ids}-industry`} value={state.industry ?? ""} onChange={(event) => update({ industry: event.target.value || undefined })} className={cn(selectClass, "lg:max-w-64")}>
                            <option value="">All industries{state.sector ? ` in ${SECTOR_LABEL.get(state.sector)}` : ""}</option>
                            {industries.map(({ industry, count }) => (
                                <option key={industry} value={industry}>
                                    {industry} ({count})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* What's applied and what the rows are */}
            {native && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {state.sector && state.universe === "sp500" && <Chip label={`Sector: ${SECTOR_LABEL.get(state.sector)}`} onClear={() => update({ sector: undefined, industry: undefined })} />}
                    {state.industry && state.universe === "sp500" && <Chip label={`Industry: ${state.industry}`} onClear={() => update({ industry: undefined })} />}
                    {state.query.trim() && <Chip label={`Search: ${state.query.trim()}`} onClear={() => update({ query: "" })} />}
                    {ranges.map((key) => (
                        <Chip key={key} label={describeRange(key, state.filters[key]!)} onClear={() => update({ filters: Object.fromEntries(Object.entries(state.filters).filter(([entry]) => entry !== key)) })} />
                    ))}
                    <p className="min-w-0 text-gray-500" aria-live="polite">
                        {table.rows.length === table.total ? `${table.total}` : `${table.rows.length} of ${table.total}`} {universeWord}
                        {table.unchecked > 0 && ` · ${table.unchecked} not shown: missing a filtered figure${state.universe === "sp500" && table.loaded < table.total ? " (load figures)" : ""}`}
                        {state.universe === "sp500" && ` · figures loaded for ${table.loaded}`}
                    </p>
                    {canLoad && (
                        <ToolButton
                            onClick={() => table.request(table.unrequested)}
                            title={`Up to ${table.unrequested.length * CALLS_PER_STOCK} Finnhub calls when nothing is cached, about ${loadMinutes(table.unrequested.length)} min within the free plan's budget. Loaded figures are kept, so loading again costs little.`}
                            pressed
                        >
                            <Download aria-hidden className="h-3.5 w-3.5" />
                            Load figures for {table.unrequested.length} {table.unrequested.length === 1 ? "stock" : "stocks"}
                        </ToolButton>
                    )}
                    {state.universe === "sp500" && table.unrequested.length > 0 && !canLoad && <span className="text-gray-500">Pick a sector or industry, or search, to load figures (up to {FIGURE_LOAD_LIMIT} stocks at a time).</span>}
                    {(table.loading || table.waiting > 0) && (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                            {table.waiting > 0 ? `${table.waiting} waiting for Finnhub's call budget; they fill in on their own` : "Loading figures"}
                        </span>
                    )}
                </div>
            )}

            {table.error && native && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-sm text-gray-100">
                    {table.error === "signed-out" ? "Your session ended, so figures can't load. Sign in again." : "Couldn't load figures for some stocks."}
                    {table.error !== "signed-out" && (
                        <ToolButton onClick={table.retry} title="Try loading them again">
                            Retry
                        </ToolButton>
                    )}
                </div>
            )}

            {state.universe === "us" ? (
                <section aria-label="TradingView stock screener" className="flex flex-col gap-2">
                    <div className="h-[max(560px,calc(100dvh-16rem))] min-w-0 overflow-hidden rounded-xl border border-gray-600 bg-gray-800">
                        <TvScreener screen={state.screen} view={state.view} />
                    </div>
                    <p className="text-xs text-gray-500">
                        TradingView&apos;s screener of every US-listed stock. Its own Filters button narrows by sector, industry, market cap, price, change, volume, relative volume, P/E, dividend yield, technical rating
                        and more; those choices stay inside its frame, so they reset when the page reloads and aren&apos;t saved in presets. Clicking a stock opens its Loops Watch page.
                    </p>
                </section>
            ) : (
                <div className={cn("grid items-start gap-4", prefs.panel && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
                    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-600 bg-gray-800">
                        {state.universe === "watchlist" && table.list && table.list.items.length === 0 ? (
                            <p className="px-6 py-12 text-center text-sm text-gray-500">{table.list.name} is empty. Add stocks from a stock&apos;s details here, or on the Watchlist page.</p>
                        ) : table.rows.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                                <p className="max-w-md text-sm text-gray-400">
                                    {table.unchecked > 0 && table.loaded === 0 ? "Figure filters need figures. Load them first, or clear the figure filters." : `No ${universeWord} match these filters.`}
                                </p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {canLoad && (
                                        <ToolButton onClick={() => table.request(table.unrequested)} title={`Up to ${table.unrequested.length * CALLS_PER_STOCK} Finnhub calls when nothing is cached`} pressed>
                                            <Download aria-hidden className="h-3.5 w-3.5" />
                                            Load figures for {table.unrequested.length} {table.unrequested.length === 1 ? "stock" : "stocks"}
                                        </ToolButton>
                                    )}
                                    <ToolButton onClick={() => update({ sector: undefined, industry: undefined, query: "", filters: {} })} title="Clear every filter">
                                        <X aria-hidden className="h-3.5 w-3.5" />
                                        Clear filters
                                    </ToolButton>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:block">
                                    <WatchlistGrid
                                        rows={table.rows}
                                        columns={state.columns}
                                        sort={state.sort}
                                        onSort={(key) => update({ sort: nextScreenSort(state.sort, key) })}
                                        density={prefs.density}
                                        selected={selected}
                                        onSelect={select}
                                        label={state.universe === "sp500" ? "S&P 500 screener" : `${table.list?.name ?? "Watchlist"} screener`}
                                        maxHeightClass="max-h-[max(420px,calc(100dvh-19rem))] min-h-24"
                                    />
                                </div>
                                <div className="md:hidden">
                                    <WatchCards rows={table.rows.slice(0, 200)} selected={selected} onSelect={select} listName={state.universe === "sp500" ? "S&P 500" : (table.list?.name ?? "Watchlist")} otherListsFor={otherLists} actionsFor={actionsFor} />
                                    {table.rows.length > 200 && <p className="px-4 py-3 text-xs text-gray-500">Showing the first 200. Search or pick a sector to narrow the list.</p>}
                                </div>
                            </>
                        )}
                    </div>

                    {prefs.panel && (
                        <div className="hidden xl:sticky xl:top-24 xl:block">
                            <InspectPanel
                                row={selectedRow}
                                variant="side"
                                otherLists={selectedRow ? otherLists(selectedRow.symbol) : []}
                                canMoveUp={false}
                                canMoveDown={false}
                                actions={selectedRow ? actionsFor(selectedRow) : null}
                                emptyText="Select a row to see its figures, open its analysis or add it to a watchlist."
                            />
                        </div>
                    )}
                </div>
            )}

            {native && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                    <p className="min-w-0 flex-1">
                        Finnhub figures through the app&apos;s shared cache; each price shows its time. A dash means no figure; n/a means it doesn&apos;t apply to a fund.
                        {state.universe === "sp500" && " Sector and industry are GICS, from the S&P 500 list of 2026-10-09."} Volume is the 10-day average; Finnhub&apos;s free plan has no same-day volume.
                    </p>
                    <p className="hidden lg:block" aria-hidden>
                        ↑↓ select · Enter open
                    </p>
                    {table.incomplete.length > 0 && !table.loading && (
                        <ToolButton onClick={table.retryIncomplete} title="Finnhub didn't send some of these rows' key figures (busy, rate limit or an error); ask for them again">
                            Retry {table.incomplete.length} incomplete {table.incomplete.length === 1 ? "row" : "rows"}
                        </ToolButton>
                    )}
                </div>
            )}
        </div>
    );
};

export default MarketsApp;
