'use client';

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import TradingViewWidget from "@/components/TradingViewWidget";
import { OPEN_SEARCH_EVENT } from "@/components/SearchCommand";
import { useDebounce } from "@/hooks/useDebounce";
import { MARKET_SECTORS, SP500_COMPANIES, type MarketSector, type SectorCompany } from "@/lib/data/sp500";
import { MARKET_DATA_LIST_WIDGET_CONFIG, MARKET_DATA_PAGE_WIDGET_CONFIG, TRADINGVIEW_SCRIPT_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SectorFilter = MarketSector | "All";

const COMPANY_BY_SYMBOL = new Map(SP500_COMPANIES.map((company) => [company.symbol, company]));

// Sizes of TradingView's quotes list (column headings, then one row per stock), in pixels
const QUOTES_HEADER_HEIGHT = 60;
const QUOTES_ROW_HEIGHT = 36;

// Lets a ticker like BRK.B be typed as "brk b" or "brkb"
const normalizeSymbol = (value: string) => value.toLowerCase().replace(/[\s.-]/g, "");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Scores how well a company matches the search (lower is better), or -1 when it doesn't match.
// Names and industries match from the start of a word, so "nv" finds Nvidia but not Invesco.
const createMatcher = (query: string) => {
    const typedSymbol = normalizeSymbol(query);
    const typedName = query.toLowerCase();
    const wordStart = new RegExp(`\\b${escapeRegExp(query)}`, "i");

    return (company: SectorCompany) => {
        const symbol = normalizeSymbol(company.symbol);

        if (typedSymbol && symbol === typedSymbol) return 0;
        if (typedSymbol && symbol.startsWith(typedSymbol)) return 1;
        if (company.name.toLowerCase().startsWith(typedName)) return 2;
        if (wordStart.test(company.name)) return 3;
        if (wordStart.test(company.industry)) return 4;
        return -1;
    };
};

const SectorChip = ({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) => (
    <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
            "flex shrink-0 items-center gap-2 rounded-full border px-4 h-9 text-sm font-medium transition-colors cursor-pointer",
            active ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-100"
        )}
    >
        {label}
        {count !== undefined && <span className={cn("tabular-nums", active ? "opacity-70" : "text-gray-500")}>{count}</span>}
    </button>
);

// Search box and sector filter for the Market Data page. With neither in use it shows TradingView's
// screener of every US stock; otherwise it lists the matching S&P 500 companies with live prices.
const MarketDataExplorer = ({ initialSector }: { initialSector?: MarketSector }) => {
    const [query, setQuery] = useState("");
    // The list follows the search box after a short pause, so the widget doesn't reload on every key
    const [appliedQuery, setAppliedQuery] = useState("");
    const [sector, setSector] = useState<SectorFilter>(initialSector ?? "All");

    const applyQuery = useDebounce(() => setAppliedQuery(query.trim()), 300);

    useEffect(() => {
        applyQuery();
    }, [query, applyQuery]);

    const clearSearch = () => {
        setQuery("");
        setAppliedQuery("");
    };

    // Companies matching the search across every sector, best matches first, then by name
    const searchMatches = useMemo(() => {
        if (!appliedQuery) return SP500_COMPANIES;

        const matchRank = createMatcher(appliedQuery);
        return SP500_COMPANIES
            .map((company) => ({ company, rank: matchRank(company) }))
            .filter(({ rank }) => rank >= 0)
            .sort((a, b) => a.rank - b.rank)
            .map(({ company }) => company);
    }, [appliedQuery]);

    const sectorCounts = useMemo(() => {
        const counts = new Map<MarketSector, number>();
        for (const company of searchMatches) counts.set(company.sector, (counts.get(company.sector) ?? 0) + 1);
        return counts;
    }, [searchMatches]);

    const results = sector === "All" ? searchMatches : searchMatches.filter((company) => company.sector === sector);
    const showScreener = sector === "All" && !appliedQuery;
    const sectorLabel = MARKET_SECTORS.find(({ value }) => value === sector)?.label;
    const listTitle = appliedQuery ? "Search results" : sectorLabel ?? "Stocks";

    // Tall enough to show every stock in the list, so the page scrolls instead of the widget
    const listHeight = QUOTES_HEADER_HEIGHT + results.length * QUOTES_ROW_HEIGHT;

    // Rebuild the widget only when the list of stocks actually changes
    const symbolsKey = results.map(({ symbol }) => symbol).join(",");
    const listConfig = useMemo(() => ({
        ...MARKET_DATA_LIST_WIDGET_CONFIG,
        height: listHeight,
        symbolsGroups: [{
            name: listTitle,
            symbols: symbolsKey.split(",").filter(Boolean).map((symbol) => ({
                name: symbol,
                displayName: COMPANY_BY_SYMBOL.get(symbol)?.name ?? symbol,
            })),
        }],
    }), [symbolsKey, listTitle, listHeight]);

    const stockWord = results.length === 1 ? "stock" : "stocks";
    const matchWord = results.length === 1 ? "matches" : "match";
    const sectorPrefix = sectorLabel ? `${sectorLabel} ` : "";
    let summary: string;
    if (showScreener) summary = "Every US-listed stock. Search or pick a sector to narrow it down.";
    else if (results.length === 0) summary = `No S&P 500 ${sectorPrefix}stocks match "${appliedQuery}".`;
    else if (appliedQuery) summary = `${results.length} S&P 500 ${sectorPrefix}${stockWord} ${matchWord} "${appliedQuery}"`;
    else summary = `${results.length} ${sectorLabel} ${stockWord} in the S&P 500`;

    // Opens the header's search, which covers every stock, with the same words already typed
    const searchAllStocks = () => {
        window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: query.trim() }));
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
                <div className="relative w-full sm:max-w-md">
                    <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") clearSearch(); }}
                        placeholder="Search by company, ticker or industry"
                        aria-label="Search stocks"
                        enterKeyHint="search"
                        className="h-11 w-full rounded-lg border border-gray-600 bg-gray-800 pl-10 pr-10 text-base text-gray-100 placeholder:text-gray-500 outline-none transition-colors focus:border-gray-400"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={clearSearch}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-100 transition-colors cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div role="group" aria-label="Filter by sector" className="flex gap-2 overflow-x-auto scrollbar-hide sm:flex-wrap">
                    <SectorChip label="All" active={sector === "All"} onClick={() => setSector("All")} />
                    {MARKET_SECTORS.map(({ value, label }) => (
                        <SectorChip
                            key={value}
                            label={label}
                            count={sectorCounts.get(value) ?? 0}
                            active={sector === value}
                            onClick={() => setSector(value)}
                        />
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                <p className="text-gray-500" aria-live="polite">{summary}</p>
                {!showScreener && (
                    <button type="button" onClick={searchAllStocks} className="font-medium text-gray-400 hover:text-gray-100 transition-colors cursor-pointer">
                        Not listed? Search all stocks
                    </button>
                )}
            </div>

            {showScreener ? (
                <TradingViewWidget
                    key="screener"
                    scriptUrl={`${TRADINGVIEW_SCRIPT_URL}screener.js`}
                    config={MARKET_DATA_PAGE_WIDGET_CONFIG}
                    height={800}
                />
            ) : results.length > 0 ? (
                <TradingViewWidget
                    key="list"
                    scriptUrl={`${TRADINGVIEW_SCRIPT_URL}market-quotes.js`}
                    config={listConfig}
                    height={listHeight}
                />
            ) : (
                <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-600 px-6 py-16 text-center">
                    <p className="text-gray-400">It may be listed outside the S&amp;P 500. Search every US stock instead.</p>
                    <button type="button" onClick={searchAllStocks} className="watchlist-btn w-fit! px-6">
                        Search all stocks
                    </button>
                </div>
            )}
        </div>
    );
};

export default MarketDataExplorer;
