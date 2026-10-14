"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridRow } from "@/components/watchlist/WatchlistGrid";
import { useWatchRows } from "@/components/watchlist/useWatchRows";
import { COMPANY_BY_SYMBOL, FIGURE_LOAD_LIMIT, applyRanges, sp500Matches, type ScreenState } from "@/lib/screener";
import { sortRows, type WatchList, type WatchRow } from "@/lib/watchlists";

type ViewRow = WatchRow & { grid: GridRow };

// What a row is sorted and filtered by before its figures arrive: only what the list knows (symbol, name, sector)
const placeholder = (symbol: string, company: string, sector?: string): WatchRow => ({ symbol, kind: "stock", currency: "USD", name: company, sector, checkedAt: 0 });

// The native screener's rows (S&P 500 or a watchlist) with their Finnhub figures, filtered and sorted by the state.
// Watchlist figures load as on the Watchlist page; S&P 500 figures load only for symbols asked for (request), so
// browsing the list costs no calls. Figures come through /api/watchlist/rows: the shared cache and call budget.
// Asked-for symbols kept for the browser tab, at most this many
const KEEP_MAX = 300;
// A big load outruns the free plan's 50 calls a minute, so the server answers "busy" for stocks still queued and
// keeps fetching them into its cache. The table asks for those again (not for anything new) every 20 seconds until
// they're in, for at most 8 minutes; repeats are answered from the cache or joined to the call already queued.
const COLLECT_MS = 20_000;
const COLLECT_ROUNDS = 24;

// keepKey keeps the asked-for symbols for the browser tab (sessionStorage), so Back from a stock page shows the same
// figures again. Only kept symbols on show load again, from the server's cache (prices are kept 5 minutes in the
// session), so that costs few or no new calls.
export const useScreenerTable = (state: ScreenState, lists: WatchList[] | null, fallbackListId?: string, keepKey?: string) => {
    const [requested, setRequested] = useState<string[]>([]);
    const [restored, setRestored] = useState<ReadonlySet<string>>(() => new Set());
    useEffect(() => {
        if (!keepKey) return;
        let kept: unknown = [];
        try {
            kept = JSON.parse(window.sessionStorage.getItem(keepKey) ?? "[]");
        } catch {
            // Nothing kept
        }
        if (!Array.isArray(kept) || kept.length === 0) return;
        const symbols = kept.filter((symbol): symbol is string => typeof symbol === "string" && COMPANY_BY_SYMBOL.has(symbol));
        // After the first paint, so the page hydrates as the server drew it
        let current = true;
        void Promise.resolve().then(() => current && setRestored(new Set(symbols)));
        return () => {
            current = false;
        };
    }, [keepKey]);
    useEffect(() => {
        if (!keepKey || requested.length === 0) return;
        try {
            window.sessionStorage.setItem(keepKey, JSON.stringify([...new Set([...restored, ...requested])].slice(-KEEP_MAX)));
        } catch {
            // Not kept; the figures load again when asked
        }
    }, [keepKey, requested, restored]);
    const list = state.universe === "watchlist" && lists ? (lists.find((entry) => entry.id === state.listId) ?? lists.find((entry) => entry.id === fallbackListId) ?? lists[0]) : undefined;
    const listItems = list?.items;
    const { universe, sector, industry, query } = state;
    const matches = useMemo(() => (universe === "sp500" ? sp500Matches({ sector, industry, query }) : []), [universe, sector, industry, query]);
    // Kept symbols load again only when they're on show
    const restoring = useMemo(() => matches.filter((company) => restored.has(company.symbol)).map((company) => company.symbol), [matches, restored]);
    const symbols = useMemo(() => [...new Set([...(listItems ?? []).map((item) => item.symbol), ...requested, ...restoring])], [listItems, requested, restoring]);
    const { rows, load, loadFigures, loading, error } = useWatchRows(symbols, []);
    const requestedSet = useMemo(() => new Set([...requested, ...restoring]), [requested, restoring]);

    const base = useMemo((): ViewRow[] => {
        if (universe === "sp500") {
            return matches.map((company) => {
                const loaded = rows[company.symbol];
                // Sector and industry here are the S&P 500 list's GICS names, the ones the filters use
                const data = loaded && { ...loaded, sector: company.sector, industry: company.industry };
                const grid: GridRow = { symbol: company.symbol, company: company.name, sector: company.sector, industry: company.industry, data, idle: !loaded && !requestedSet.has(company.symbol) };
                return { ...(data ?? placeholder(company.symbol, company.name, company.sector)), grid };
            });
        }
        if (universe === "watchlist" && listItems) {
            const text = query.trim().toLowerCase();
            return listItems
                .map((item) => {
                    const member = COMPANY_BY_SYMBOL.get(item.symbol);
                    const loaded = rows[item.symbol];
                    const data = loaded && { ...loaded, sector: member?.sector };
                    const grid: GridRow = { symbol: item.symbol, company: item.company, sector: member?.sector, data };
                    return { ...(data ?? placeholder(item.symbol, item.company, member?.sector)), grid };
                })
                .filter((row) => !text || [row.symbol, row.name, row.industry].some((value) => value?.toLowerCase().includes(text)));
        }
        return [];
    }, [universe, query, matches, listItems, rows, requestedSet]);

    const { kept, unchecked } = useMemo(() => applyRanges(base, state.filters), [base, state.filters]);
    const view = useMemo(() => sortRows(kept, state.sort).map((row) => row.grid), [kept, state.sort]);

    const loaded = base.filter((row) => row.grid.data).length;
    // S&P 500 symbols on show that nobody has asked figures for yet
    const unrequested = useMemo(() => base.filter((row) => row.grid.idle).map((row) => row.symbol), [base]);
    const incomplete = useMemo(() => base.filter((row) => row.grid.data?.figuresIssue && row.grid.data.price !== undefined).map((row) => row.symbol), [base]);

    const busy = useMemo(() => base.filter((row) => row.grid.data && (row.grid.data.issue === "busy" || row.grid.data.figuresIssue === "busy")).map((row) => row.symbol), [base]);
    const busyKey = busy.join(",");
    const rounds = useRef(0);
    useEffect(() => {
        if (!busyKey || loading || rounds.current >= COLLECT_ROUNDS) return;
        const timer = window.setTimeout(() => {
            rounds.current += 1;
            void load(busyKey.split(","), true);
        }, COLLECT_MS);
        return () => window.clearTimeout(timer);
    }, [busyKey, loading, load]);

    const request = useCallback((list: readonly string[]) => {
        rounds.current = 0;
        const add = list.slice(0, FIGURE_LOAD_LIMIT);
        setRequested((previous) => {
            const missing = add.filter((symbol) => !previous.includes(symbol));
            return missing.length === 0 ? previous : [...previous, ...missing];
        });
    }, []);

    return {
        list,
        rows: view,
        total: base.length,
        unchecked,
        loaded,
        unrequested,
        incomplete,
        // Stocks waiting for the call budget, which fill in on their own
        waiting: busy.length,
        loading,
        error,
        request,
        refresh: () => void load(base.filter((row) => row.grid.data).map((row) => row.symbol), true),
        retryIncomplete: () => void loadFigures(incomplete),
        retry: () => void load(symbols),
    };
};
