"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GridRow } from "@/components/watchlist/WatchlistGrid";
import { useWatchRows } from "@/components/watchlist/useWatchRows";
import { COMPANY_BY_SYMBOL, applyRanges, type ScreenState } from "@/lib/screener";
import { sortRows, type WatchList, type WatchRow } from "@/lib/watchlists";

type ViewRow = WatchRow & { grid: GridRow };

// What a row is sorted and filtered by before its figures arrive: only what the list knows (symbol, name, sector)
const placeholder = (symbol: string, company: string, sector?: string): WatchRow => ({ symbol, kind: "stock", currency: "USD", name: company, sector, checkedAt: 0 });

// The watchlist screener's rows with their Finnhub figures, filtered and sorted by the state. Figures load as on the
// Watchlist page, through /api/watchlist/rows: the shared cache and call budget.
// A long list can outrun the free plan's 50 calls a minute, so the server answers "busy" for stocks still queued and
// keeps fetching them into its cache. The table asks for those again (not for anything new) every 20 seconds until
// they're in, for at most 8 minutes; repeats are answered from the cache or joined to the call already queued.
const COLLECT_MS = 20_000;
const COLLECT_ROUNDS = 24;

export const useScreenerTable = (state: ScreenState, lists: WatchList[] | null, fallbackListId?: string) => {
    const list = state.universe === "watchlist" && lists ? (lists.find((entry) => entry.id === state.listId) ?? lists.find((entry) => entry.id === fallbackListId) ?? lists[0]) : undefined;
    const listItems = list?.items;
    const { query } = state;
    const symbols = useMemo(() => (listItems ?? []).map((item) => item.symbol), [listItems]);
    const { rows, load, loadFigures, loading, error } = useWatchRows(symbols, []);

    const base = useMemo((): ViewRow[] => {
        if (!listItems) return [];
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
    }, [query, listItems, rows]);

    const { kept, unchecked } = useMemo(() => applyRanges(base, state.filters), [base, state.filters]);
    const view = useMemo(() => sortRows(kept, state.sort).map((row) => row.grid), [kept, state.sort]);

    const loaded = base.filter((row) => row.grid.data).length;
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

    return {
        list,
        rows: view,
        total: base.length,
        unchecked,
        loaded,
        incomplete,
        // Stocks waiting for the call budget, which fill in on their own
        waiting: busy.length,
        loading,
        error,
        refresh: () => void load(base.filter((row) => row.grid.data).map((row) => row.symbol), true),
        retryIncomplete: () => void loadFigures(incomplete),
        retry: () => void load(symbols),
    };
};
