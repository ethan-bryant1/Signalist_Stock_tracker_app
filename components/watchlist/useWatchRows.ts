"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withFigures, type WatchFigures, type WatchRow } from "@/lib/watchlists";

// Symbols per request: small enough that a long list fills in as it loads, large enough to keep requests few
const CHUNK = 40;

export type RowsError = "signed-out" | "failed";

export const fetchWatchRows = async (symbols: readonly string[]): Promise<WatchRow[]> => {
    const response = await fetch(`/api/watchlist/rows?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
    if (response.status === 401) throw new Error("signed-out");
    if (!response.ok) throw new Error("failed");
    const body = (await response.json()) as { rows?: WatchRow[] };
    return Array.isArray(body.rows) ? body.rows : [];
};

const fetchWatchFigures = async (symbols: readonly string[]): Promise<WatchFigures[]> => {
    const response = await fetch(`/api/watchlist/rows?part=figures&symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
    if (response.status === 401) throw new Error("signed-out");
    if (!response.ok) throw new Error("failed");
    const body = (await response.json()) as { figures?: WatchFigures[] };
    return Array.isArray(body.figures) ? body.figures : [];
};

// The grid's figures by symbol. Each symbol is asked for once when it first shows up in a list (the server answers
// from the shared cache); after that only the Refresh and "Retry incomplete rows" buttons ask again. No polling.
export const useWatchRows = (symbols: readonly string[], initial: readonly WatchRow[]) => {
    const [rows, setRows] = useState<Record<string, WatchRow>>(() => Object.fromEntries(initial.map((row) => [row.symbol, row])));
    const [pending, setPending] = useState(0);
    const [error, setError] = useState<RowsError | null>(null);
    const requested = useRef<Set<string> | null>(null);

    const put = useCallback((list: readonly WatchRow[]) => {
        if (list.length === 0) return;
        setRows((previous) => {
            const next = { ...previous };
            for (const row of list) next[row.symbol] = row;
            return next;
        });
    }, []);

    // force asks again for symbols already loaded (Refresh, waiting prices)
    const load = useCallback(
        async (list: readonly string[], force = false) => {
            requested.current ??= new Set(initial.map((row) => row.symbol));
            const asked = requested.current;
            const todo = force ? [...new Set(list)] : list.filter((symbol) => !asked.has(symbol));
            if (todo.length === 0) return;
            todo.forEach((symbol) => asked.add(symbol));
            setPending((count) => count + 1);
            setError(null);
            try {
                for (let at = 0; at < todo.length; at += CHUNK) put(await fetchWatchRows(todo.slice(at, at + CHUNK)));
            } catch (e) {
                // Let the next attempt ask for them again
                todo.forEach((symbol) => asked.delete(symbol));
                setError(e instanceof Error && e.message === "signed-out" ? "signed-out" : "failed");
            } finally {
                setPending((count) => count - 1);
            }
        },
        // initial only seeds the first call
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [put]
    );

    // Only the key figures, for rows whose price is already there (no price is fetched again)
    const loadFigures = useCallback(async (list: readonly string[]) => {
        if (list.length === 0) return;
        setPending((count) => count + 1);
        setError(null);
        try {
            for (let at = 0; at < list.length; at += CHUNK) {
                const got = await fetchWatchFigures(list.slice(at, at + CHUNK));
                setRows((previous) => {
                    const next = { ...previous };
                    for (const figures of got) if (next[figures.symbol]) next[figures.symbol] = withFigures(next[figures.symbol], figures);
                    return next;
                });
            }
        } catch (e) {
            setError(e instanceof Error && e.message === "signed-out" ? "signed-out" : "failed");
        } finally {
            setPending((count) => count - 1);
        }
    }, []);

    useEffect(() => {
        void load(symbols);
    }, [symbols, load]);

    return { rows, put, load, loadFigures, loading: pending > 0, error };
};
