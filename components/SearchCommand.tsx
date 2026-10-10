"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { Loader2, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import DayRange from "@/components/DayRange";
import StockLogo from "@/components/StockLogo";
import { useDebounce } from "@/hooks/useDebounce";
import { getStockQuote, searchStocks, type StockQuote } from "@/lib/actions/finnhub.actions";
import { addToWatchlist, getWatchlistSymbols, removeFromWatchlist } from "@/lib/actions/watchlist.actions";
import type { SectorCompany } from "@/lib/data/sp500";
import { createMatcher, describeSecurityType, findMatch, SECURITY_FILTERS, type SecurityKind } from "@/lib/search";
import { cn, formatChangePercent, formatCurrency, formatMarketCapValue, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

// Other buttons (like "Search all stocks" on the Market Data page) open the search by dispatching this event.
// A CustomEvent whose detail is a string also fills in the search box with it.
export const OPEN_SEARCH_EVENT = "open-stock-search";

type Row = { symbol: string; name: string; type?: string };
type Section = { id: string; title: string; rows: Row[]; action?: React.ReactNode };
type Preview = { quote: StockQuote | null; loadedAt: number };
type Filter = SecurityKind | "all";

const RECENT_KEY = "loops-watch:recent-searches";
const MAX_RECENT = 5;
const MAX_WATCHLIST_ROWS = 5;
// S&P 500 matches show at once, before Finnhub's wider search answers
const MAX_INSTANT_MATCHES = 8;
const MAX_RESULTS = 20;
// The preview's price is loaded again after a minute
const PREVIEW_MAX_AGE = 60_000;
const isFresh = (preview?: Preview) => !!preview && Date.now() - preview.loadedAt < PREVIEW_MAX_AGE;

// Recent searches are kept in this browser only
const readRecent = (): Row[] => {
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
        if (!Array.isArray(saved)) return [];
        return saved
            .filter((row): row is Row => typeof row?.symbol === "string" && typeof row?.name === "string")
            .slice(0, MAX_RECENT);
    } catch {
        return [];
    }
};

const saveRecent = (rows: Row[]) => {
    try {
        if (rows.length) localStorage.setItem(RECENT_KEY, JSON.stringify(rows));
        else localStorage.removeItem(RECENT_KEY);
    } catch {
        // Private windows can block storage; recent searches just aren't remembered then
    }
};

// The S&P 500 list loads the first time the search opens, so it doesn't slow down page loads
let companiesRequest: Promise<SectorCompany[]> | null = null;
const loadCompanies = () => {
    companiesRequest ??= import("@/lib/data/sp500")
        .then((data) => data.SP500_COMPANIES)
        .catch(() => {
            companiesRequest = null;
            return [];
        });
    return companiesRequest;
};

// "⌘" on Apple devices and "Ctrl" elsewhere, for the keyboard hints
const subscribeToNothing = () => () => {};
const useModifierKey = () =>
    useSyncExternalStore(subscribeToNothing, () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"), () => "Ctrl");

// Whether a key press belongs to something else on the page, like a form field or an open menu
const isBusyElement = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select, [role=menu], [role=listbox], [role=dialog]"));

const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <kbd
        className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded border border-gray-600 bg-gray-800 px-1 font-sans text-[11px] font-medium text-gray-500",
            className
        )}
    >
        {children}
    </kbd>
);

// The part of a name that matches the search, in bold
const Highlighted = ({ text, query }: { text: string; query: string }) => {
    const match = findMatch(text, query);
    if (!match) return text;

    return (
        <>
            {text.slice(0, match.start)}
            <mark className="bg-transparent font-semibold text-gray-100">{text.slice(match.start, match.end)}</mark>
            {text.slice(match.end)}
        </>
    );
};

const TypeBadge = ({ type }: { type: string }) => {
    const { badge, label } = describeSecurityType(type);
    return (
        <span title={label} className="w-10 shrink-0 rounded border border-gray-600 py-px text-center text-[10px] font-semibold tracking-wide text-gray-500">
            {badge}
        </span>
    );
};

const StarButton = ({ symbol, saved, onToggle, className }: { symbol: string; saved: boolean; onToggle: () => void; className?: string }) => {
    const label = saved ? `Remove ${symbol} from your watchlist` : `Add ${symbol} to your watchlist`;
    return (
        <button
            type="button"
            // Stops the click from also opening the stock
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            aria-pressed={saved}
            aria-label={label}
            title={label}
            className={cn(
                "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-gray-600",
                saved ? "text-gray-100" : "text-gray-500 hover:text-gray-100",
                className
            )}
        >
            <Star className="size-4" fill={saved ? "currentColor" : "none"} />
        </button>
    );
};

const ResultRow = ({ value, row, query, saved, onOpen, onToggleSaved }: {
    value: string;
    row: Row;
    query: string;
    saved?: boolean;
    onOpen: () => void;
    onToggleSaved: () => void;
}) => (
    <CommandPrimitive.Item
        value={value}
        onSelect={onOpen}
        className="group/row flex h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 outline-none data-[selected=true]:bg-gray-700"
    >
        <span className="w-[4.5rem] shrink-0 truncate text-sm font-semibold tracking-tight text-gray-100">{row.symbol}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-400">
            <Highlighted text={row.name} query={query} />
        </span>
        {row.type ? <TypeBadge type={row.type} /> : <span className="w-10 shrink-0" />}
        {saved !== undefined && (
            <StarButton
                symbol={row.symbol}
                saved={saved}
                onToggle={onToggleSaved}
                // On wider screens an empty star only shows on the row being pointed at or highlighted
                className={cn(!saved && "md:opacity-0 md:group-hover/row:opacity-100 md:group-data-[selected=true]/row:opacity-100 focus-visible:opacity-100")}
            />
        )}
    </CommandPrimitive.Item>
);

const Stat = ({ label, value }: { label: string; value?: string }) => (
    <div className="min-w-0">
        <dt className="text-gray-500">{label}</dt>
        <dd className="mt-0.5 truncate font-medium tabular-nums text-gray-100">{value ?? "—"}</dd>
    </div>
);

// Details of the highlighted stock beside the results: today's price, range and key figures
const QuotePreview = ({ row, preview, saved, modifierKey, onOpen, onToggleSaved }: {
    row: Row;
    preview?: Preview;
    saved?: boolean;
    modifierKey: string;
    onOpen: () => void;
    onToggleSaved: () => void;
}) => {
    const quote = preview?.quote;
    const currency = quote?.currency;
    const hasPrice = quote?.price !== undefined;
    const details = [row.symbol, quote?.exchange, quote?.industry].filter(Boolean).join(" · ");

    return (
        <div className="flex h-full flex-col p-5">
            <div className="flex items-start gap-3">
                <StockLogo symbol={row.symbol} logo={quote?.logo} className="h-11 w-11 rounded-lg p-1.5 text-sm" />
                <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-100">{quote?.name || row.name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{details}</p>
                </div>
            </div>

            {!preview ? (
                <div className="mt-6 animate-pulse" aria-label="Loading price">
                    <div className="h-8 w-32 rounded bg-gray-700" />
                    <div className="mt-2 h-4 w-24 rounded bg-gray-700" />
                    <div className="mt-6 h-1 rounded bg-gray-700" />
                    <div className="mt-6 grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-8 rounded bg-gray-700" />)}
                    </div>
                </div>
            ) : hasPrice ? (
                <>
                    <p className="mt-5 text-3xl font-semibold tabular-nums tracking-tight text-gray-100">{formatCurrency(quote.price!, currency)}</p>
                    <p className={cn("mt-1 text-sm font-medium tabular-nums", getChangeColorClass(quote.changePercent))}>
                        {quote.change !== undefined && quote.changePercent !== undefined
                            ? `${formatSignedNumber(quote.change)} (${formatChangePercent(quote.changePercent)})`
                            : "—"}
                        <span className="ml-1.5 font-normal text-gray-500">Today</span>
                    </p>
                    {quote.dayLow !== undefined && quote.dayHigh !== undefined && (
                        <DayRange low={quote.dayLow} high={quote.dayHigh} price={quote.price!} currency={currency} className="mt-5" />
                    )}
                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <Stat label="Open" value={quote.open !== undefined ? formatCurrency(quote.open, currency) : undefined} />
                        <Stat label="Prev. close" value={quote.previousClose !== undefined ? formatCurrency(quote.previousClose, currency) : undefined} />
                        <Stat label="Market cap" value={quote.marketCap ? formatMarketCapValue(quote.marketCap) : undefined} />
                        <Stat label="Type" value={row.type ? describeSecurityType(row.type).label : undefined} />
                    </dl>
                </>
            ) : (
                <p className="mt-6 text-sm text-gray-500">No price is available for {row.symbol} right now. Its page may still have charts and news.</p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-5">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90"
                >
                    Open {row.symbol}
                    <Kbd className="border-current/30 bg-transparent text-current opacity-70">↵</Kbd>
                </button>
                {saved !== undefined && (
                    <button
                        type="button"
                        onClick={onToggleSaved}
                        aria-pressed={saved}
                        className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-600 text-sm font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100"
                    >
                        <Star className="size-4" fill={saved ? "currentColor" : "none"} />
                        {saved ? "In your watchlist" : "Add to watchlist"}
                        <Kbd>{modifierKey} ↵</Kbd>
                    </button>
                )}
            </div>
        </div>
    );
};

// Shown beside the results when nothing is highlighted
const SearchTips = () => (
    <div className="flex h-full flex-col justify-center gap-3 p-5 text-sm">
        <p className="font-semibold text-gray-100">Search tips</p>
        <ul className="flex flex-col gap-2 text-gray-500">
            <li>Type a symbol, like <span className="font-medium text-gray-400">AAPL</span></li>
            <li>Or a company name, like <span className="font-medium text-gray-400">Apple</span></li>
            <li>Or an industry, like <span className="font-medium text-gray-400">semiconductors</span></li>
        </ul>
    </div>
);

const SectionHeading = ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <div className="flex h-8 items-center justify-between px-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        <span>{title}</span>
        {action}
    </div>
);

// The header's search box, and the search window it opens: instant matches from the S&P 500 and
// Finnhub's search of every US stock and fund, with a live preview of the highlighted one
export default function SearchCommand({ initialStocks }: { initialStocks: StockWithWatchlistStatus[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const modifierKey = useModifierKey();

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    // The highlighted row, which the preview shows
    const [selected, setSelected] = useState("");
    const [remote, setRemote] = useState<{ term: string; rows: Row[] } | null>(null);
    const [companies, setCompanies] = useState<SectorCompany[] | null>(null);
    // Saved stocks by symbol, newest first, or null until they load
    const [watchlist, setWatchlist] = useState<Map<string, string> | null>(null);
    const [recent, setRecent] = useState<Row[]>([]);
    const [previews, setPreviews] = useState<Record<string, Preview>>({});
    const loadingPreviews = useRef(new Set<string>());
    const latestTermRef = useRef("");
    const inputRef = useRef<HTMLInputElement>(null);

    const term = query.trim();
    const loading = !!term && remote?.term !== term;

    const openSearch = (initialQuery = "") => {
        setQuery(initialQuery);
        setFilter("all");
        setRecent(readRecent());
        setOpen(true);
        loadCompanies().then(setCompanies);
        getWatchlistSymbols()
            .then((items) => setWatchlist(new Map(items.map(({ symbol, company }) => [symbol, company]))))
            .catch(() => setWatchlist(null));
    };

    // Ctrl+K (⌘K on a Mac) or / opens the search
    const onShortcut = useEffectEvent((event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            if (open) setOpen(false);
            else openSearch();
            return;
        }
        if (open || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isBusyElement(event.target)) return;

        if (event.key === "/") {
            event.preventDefault();
            openSearch();
        }
    });

    const onOpenRequest = useEffectEvent((event: Event) => {
        openSearch(event instanceof CustomEvent && typeof event.detail === "string" ? event.detail : "");
    });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => onShortcut(event);
        const handleOpenRequest = (event: Event) => onOpenRequest(event);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener(OPEN_SEARCH_EVENT, handleOpenRequest);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenRequest);
        };
    }, []);

    // Finnhub's search runs once typing pauses. Answers for older text are ignored.
    const searchFinnhub = useDebounce(async () => {
        const value = query.trim();
        latestTermRef.current = value;
        if (!value) return;

        const rows = await searchStocks(value).catch(() => []);
        if (latestTermRef.current === value) {
            setRemote({ term: value, rows: rows.map(({ symbol, name, type }) => ({ symbol, name, type })) });
        }
    }, 250);

    useEffect(() => {
        if (open) searchFinnhub();
    }, [query, open, searchFinnhub]);

    // S&P 500 matches straight away, then Finnhub's results merged in, best matches first
    const results = useMemo<Row[]>(() => {
        if (!term) return [];
        const matchRank = createMatcher(term);
        const sp500 = new Set((companies ?? []).map(({ symbol }) => symbol));
        // An exact symbol comes first, then matches from the start of a symbol or name, then
        // matches inside a name, then industries. Big S&P 500 companies lead within each group.
        const score = (row: Row, industry?: string) => {
            const rank = matchRank({ ...row, industry });
            if (rank === 0) return 0;
            if (rank === 1 || rank === 2) return sp500.has(row.symbol) ? 1 : 2;
            if (rank === 3) return sp500.has(row.symbol) ? 3 : 4;
            return rank === 4 ? 5 : 6;
        };
        const ranked = new Map<string, { row: Row; score: number; order: number }>();

        (companies ?? [])
            .map((company) => ({ company, rank: matchRank(company) }))
            .filter((match) => match.rank >= 0)
            .sort((a, b) => a.rank - b.rank)
            .slice(0, MAX_INSTANT_MATCHES)
            .forEach(({ company }) => {
                const row = { symbol: company.symbol, name: company.name, type: "Common Stock" };
                ranked.set(company.symbol, { row, score: score(row, company.industry), order: ranked.size });
            });

        if (remote?.term === term) {
            for (const row of remote.rows) {
                const known = ranked.get(row.symbol);
                // Keep the S&P list's tidier name, but Finnhub knows the kind of security
                if (known) known.row = { ...known.row, type: row.type ?? known.row.type };
                else ranked.set(row.symbol, { row, score: score(row), order: ranked.size });
            }
        }

        return [...ranked.values()]
            .sort((a, b) => a.score - b.score || a.order - b.order)
            .slice(0, MAX_RESULTS)
            .map(({ row }) => row);
    }, [term, companies, remote]);

    const counts = useMemo(() => {
        const totals: Record<Filter, number> = { all: results.length, stock: 0, etf: 0, adr: 0, other: 0 };
        for (const row of results) totals[describeSecurityType(row.type).kind] += 1;
        return totals;
    }, [results]);

    const filteredResults = filter === "all" ? results : results.filter((row) => describeSecurityType(row.type).kind === filter);
    const filterInfo = SECURITY_FILTERS.find(({ value }) => value === filter)!;

    const clearRecent = () => {
        setRecent([]);
        saveRecent([]);
        inputRef.current?.focus();
    };

    const sections: Section[] = (() => {
        if (term) {
            if (!loading && filteredResults.length === 0) return [];
            return [{
                id: "result",
                title: filter === "all" ? "Best matches" : filterInfo.label,
                rows: filteredResults,
                action: loading
                    ? <span className="normal-case tracking-normal">Searching all US listings…</span>
                    : <span className="tabular-nums">{filteredResults.length}</span>,
            }];
        }

        const watchRows = watchlist ? [...watchlist].slice(0, MAX_WATCHLIST_ROWS).map(([symbol, name]) => ({ symbol, name })) : [];
        const shown = new Set([...recent, ...watchRows].map(({ symbol }) => symbol));
        const list: Section[] = [];

        if (recent.length) list.push({
            id: "recent",
            title: "Recent searches",
            rows: recent,
            action: (
                <button type="button" onClick={clearRecent} className="cursor-pointer normal-case tracking-normal hover:text-gray-100">
                    Clear
                </button>
            ),
        });
        if (watchRows.length) list.push({
            id: "watchlist",
            title: "Your watchlist",
            rows: watchRows,
            action: watchlist!.size > MAX_WATCHLIST_ROWS && (
                <Link href="/watchlist" onClick={() => setOpen(false)} className="normal-case tracking-normal hover:text-gray-100">
                    See all {watchlist!.size}
                </Link>
            ),
        });
        list.push({ id: "popular", title: "Popular stocks", rows: initialStocks.filter(({ symbol }) => !shown.has(symbol)) });
        return list.filter(({ rows }) => rows.length > 0);
    })();

    const rowsByValue = new Map<string, Row>(sections.flatMap(({ id, rows }) => rows.map((row) => [`${id}:${row.symbol}`, row])));
    const selectedRow = rowsByValue.get(selected);
    const previewSymbol = open ? selectedRow?.symbol : undefined;

    // Loads the highlighted stock's price once the highlight rests on it
    useEffect(() => {
        if (!previewSymbol || loadingPreviews.current.has(previewSymbol)) return;
        if (isFresh(previews[previewSymbol])) return;
        // The preview only shows on wider screens, so phones skip the extra requests
        if (!window.matchMedia("(min-width: 768px)").matches) return;

        const timer = setTimeout(() => {
            loadingPreviews.current.add(previewSymbol);
            getStockQuote(previewSymbol)
                .catch(() => null)
                .then((quote) => setPreviews((current) => ({ ...current, [previewSymbol]: { quote, loadedAt: Date.now() } })))
                .finally(() => loadingPreviews.current.delete(previewSymbol));
        }, 150);
        return () => clearTimeout(timer);
    }, [previewSymbol, previews]);

    const openStock = (row: Row) => {
        const nextRecent = [row, ...recent.filter(({ symbol }) => symbol !== row.symbol)].slice(0, MAX_RECENT);
        setRecent(nextRecent);
        saveRecent(nextRecent);
        setOpen(false);
        router.push(`/stocks/${encodeURIComponent(row.symbol)}`);
    };

    const toggleSaved = async (row: Row) => {
        if (!watchlist) return;
        const wasSaved = watchlist.has(row.symbol);
        const show = (saved: boolean) =>
            setWatchlist((current) => {
                if (!current) return current;
                const rest = [...current].filter(([symbol]) => symbol !== row.symbol);
                return new Map(saved ? [[row.symbol, row.name], ...rest] : rest);
            });

        show(!wasSaved);
        const result = await (wasSaved ? removeFromWatchlist(row.symbol) : addToWatchlist(row.symbol, row.name)).catch(() => ({ success: false }));
        if (!result.success) {
            show(wasSaved);
            toast.error("Couldn't update your watchlist. Please try again.");
            return;
        }

        toast.success(wasSaved ? `Removed ${row.symbol} from your watchlist` : `Added ${row.symbol} to your watchlist`);
        // The watchlist page lists saved stocks, so it reloads to show the change
        if (pathname === "/watchlist") router.refresh();
    };

    // Ctrl+Enter (⌘Enter on a Mac) stars the highlighted stock instead of opening it
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (selectedRow) toggleSaved(selectedRow);
        }
    };

    const visibleFilters = SECURITY_FILTERS.filter(({ value }) => value === "all" || value === filter || counts[value] > 0);

    return (
        <>
            <button
                type="button"
                onClick={() => openSearch()}
                aria-keyshortcuts="Control+K Meta+K"
                className="hidden h-9 w-40 cursor-pointer items-center gap-2 rounded-full border border-gray-600 px-3.5 text-sm text-gray-500 transition-colors hover:border-gray-500 hover:text-gray-400 sm:flex md:w-60 lg:w-40 xl:w-80"
            >
                <Search className="size-4 shrink-0" />
                {/* The full hint where the box is wide enough, otherwise just "Search" */}
                <span className="hidden truncate md:inline lg:hidden xl:inline">Search symbol or company</span>
                <span className="md:hidden lg:inline xl:hidden">Search</span>
                <span className="ml-auto hidden items-center gap-1 xl:flex" aria-hidden>
                    <Kbd>{modifierKey}</Kbd>
                    <Kbd>K</Kbd>
                </span>
            </button>
            <button
                type="button"
                onClick={() => openSearch()}
                aria-label="Search stocks"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100 sm:hidden"
            >
                <Search className="size-5" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    showCloseButton={false}
                    initialFocus={inputRef}
                    className="top-[6vh] w-full max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden rounded-xl! bg-gray-800 p-0 text-gray-400 ring-gray-600 sm:top-[10vh] sm:max-w-[960px]"
                >
                    <DialogTitle className="sr-only">Search stocks</DialogTitle>
                    <DialogDescription className="sr-only">Find a US stock or fund by its symbol, company name or industry</DialogDescription>

                    <CommandPrimitive
                        label="Search stocks"
                        shouldFilter={false}
                        loop
                        value={selected}
                        onValueChange={setSelected}
                        onKeyDown={handleKeyDown}
                        className="flex flex-col"
                    >
                        <div className="flex h-14 items-center gap-3 border-b border-gray-600 px-4">
                            {loading ? <Loader2 className="size-5 shrink-0 animate-spin text-gray-500" /> : <Search className="size-5 shrink-0 text-gray-500" />}
                            <CommandPrimitive.Input
                                ref={inputRef}
                                value={query}
                                onValueChange={setQuery}
                                placeholder="Search by symbol, company or industry"
                                className="h-full min-w-0 flex-1 bg-transparent text-base text-gray-100 outline-none placeholder:text-gray-500"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        inputRef.current?.focus();
                                    }}
                                    aria-label="Clear search"
                                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                                >
                                    <X className="size-4" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close search"
                                className="shrink-0 cursor-pointer text-sm font-medium text-gray-400 hover:text-gray-100 md:hidden"
                            >
                                Cancel
                            </button>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="hidden shrink-0 cursor-pointer md:block">
                                <Kbd>Esc</Kbd>
                            </button>
                        </div>

                        {term && results.length > 0 && (
                            <div role="group" aria-label="Kind of security" className="flex items-center gap-1 overflow-x-auto border-b border-gray-600 px-3 py-2 scrollbar-hide">
                                {visibleFilters.map(({ value, label }) => {
                                    const active = filter === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => {
                                                setFilter(value);
                                                inputRef.current?.focus();
                                            }}
                                            className={cn(
                                                "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                                                active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                                            )}
                                        >
                                            {label}
                                            <span className={cn("tabular-nums", active ? "opacity-70" : "text-gray-500")}>{counts[value]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex h-[min(440px,calc(100dvh-14rem))]">
                            <CommandPrimitive.List className="min-w-0 flex-1 overflow-y-auto overscroll-contain scroll-py-2 p-2">
                                {sections.map(({ id, title, rows, action }) => (
                                    <div key={id} className="pb-2">
                                        <SectionHeading title={title} action={action} />
                                        {rows.map((row) => (
                                            <ResultRow
                                                key={row.symbol}
                                                value={`${id}:${row.symbol}`}
                                                row={row}
                                                query={id === "result" ? term : ""}
                                                saved={watchlist ? watchlist.has(row.symbol) : undefined}
                                                onOpen={() => openStock(row)}
                                                onToggleSaved={() => toggleSaved(row)}
                                            />
                                        ))}
                                    </div>
                                ))}

                                {term && !loading && results.length === 0 && (
                                    <div className="flex flex-col items-center gap-1 px-6 py-16 text-center">
                                        <p className="font-medium text-gray-100">No matches for “{term}”</p>
                                        <p className="text-sm text-gray-500">Check the spelling, or try a symbol like AAPL.</p>
                                    </div>
                                )}
                                {term && results.length > 0 && filteredResults.length === 0 && (
                                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                                        <p className="text-sm text-gray-500">No {filterInfo.plural} match “{term}”.</p>
                                        <button type="button" onClick={() => setFilter("all")} className="cursor-pointer text-sm font-medium text-gray-100 hover:underline">
                                            Show all {results.length} results
                                        </button>
                                    </div>
                                )}
                                {!term && sections.length === 0 && (
                                    <p className="px-6 py-16 text-center text-sm text-gray-500">Start typing to search US stocks and funds.</p>
                                )}
                            </CommandPrimitive.List>

                            <aside aria-label="Preview" className="hidden w-[300px] shrink-0 border-l border-gray-600 md:block">
                                {selectedRow ? (
                                    <QuotePreview
                                        row={selectedRow}
                                        preview={previews[selectedRow.symbol]}
                                        saved={watchlist ? watchlist.has(selectedRow.symbol) : undefined}
                                        modifierKey={modifierKey}
                                        onOpen={() => openStock(selectedRow)}
                                        onToggleSaved={() => {
                                            toggleSaved(selectedRow);
                                            inputRef.current?.focus();
                                        }}
                                    />
                                ) : (
                                    <SearchTips />
                                )}
                            </aside>
                        </div>

                        <div className="hidden h-10 items-center justify-between gap-4 border-t border-gray-600 px-4 text-xs text-gray-500 md:flex">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Move</span>
                                <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open</span>
                                <span className="flex items-center gap-1.5"><Kbd>{modifierKey} ↵</Kbd> Watchlist</span>
                                <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
                            </div>
                            <span>US stocks and funds</span>
                        </div>
                    </CommandPrimitive>
                </DialogContent>
            </Dialog>
        </>
    );
}
