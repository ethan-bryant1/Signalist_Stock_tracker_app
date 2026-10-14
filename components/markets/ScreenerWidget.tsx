"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import TvScreener from "@/components/markets/TvScreener";
import { useScreenerTable } from "@/components/markets/useScreenerTable";
import WatchlistGrid from "@/components/watchlist/WatchlistGrid";
import { getMarketsPrefs } from "@/lib/actions/markets.actions";
import { getWatchlists } from "@/lib/actions/watchlist.actions";
import { BUILT_IN_PRESETS, CALLS_PER_STOCK, FIGURE_LOAD_LIMIT, paramsFromState, type Preset } from "@/lib/screener";
import type { ColumnKey, WatchlistDoc } from "@/lib/watchlists";

const COLUMNS: ColumnKey[] = ["last", "changePercent", "marketCap"];
const DEFAULT_PRESET = BUILT_IN_PRESETS[0].id;
const storageKey = (widgetId: string) => `loops-watch:screener-widget:${widgetId}`;

// The Markets screener in a workspace: any ready-made or saved preset, chosen per widget (kept in this browser).
// A native preset's table loads a picked stock into the workspace's linked widgets; TradingView's screener opens
// stock pages itself (its clicks can't be read by the workspace).
const ScreenerWidget = ({ widgetId, symbol, onPickSymbol }: { widgetId: string; symbol: string; onPickSymbol: (symbol: string) => void }) => {
    const ids = useId();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [doc, setDoc] = useState<WatchlistDoc | null>(null);
    const [choice, setChoice] = useState(DEFAULT_PRESET);

    useEffect(() => {
        let current = true;
        Promise.all([getMarketsPrefs().catch(() => "unavailable" as const), getWatchlists().catch(() => null)]).then(([prefs, lists]) => {
            if (!current) return;
            if (prefs !== "unavailable") setPresets(prefs.presets);
            setDoc(lists);
            try {
                const stored = window.localStorage.getItem(storageKey(widgetId));
                if (stored) setChoice(stored);
            } catch {
                // Storage blocked: the widget starts on the default preset each time
            }
        });
        return () => {
            current = false;
        };
    }, [widgetId]);

    const all = useMemo(() => [...BUILT_IN_PRESETS, ...presets], [presets]);
    const preset = all.find((entry) => entry.id === choice) ?? all[0];
    // A watchlist preset needs the lists; until they're in, it waits on the S&P 500 view's empty state
    const state = preset.state;
    const table = useScreenerTable(state, doc?.lists ?? null, doc?.activeId);
    const choose = (id: string) => {
        setChoice(id);
        try {
            window.localStorage.setItem(storageKey(widgetId), id);
        } catch {
            // Not kept, still applied
        }
    };
    const canLoad = state.universe === "sp500" && table.unrequested.length > 0 && table.total <= FIGURE_LOAD_LIMIT;

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-600 px-2 py-1.5">
                <label htmlFor={`${ids}-preset`} className="sr-only">
                    Screener preset
                </label>
                <select id={`${ids}-preset`} value={preset.id} onChange={(event) => choose(event.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-1.5 text-xs text-gray-100">
                    <optgroup label="Ready-made">
                        {BUILT_IN_PRESETS.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.name}
                            </option>
                        ))}
                    </optgroup>
                    {presets.length > 0 && (
                        <optgroup label="My presets">
                            {presets.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
                {canLoad && (
                    <button
                        type="button"
                        onClick={() => table.request(table.unrequested)}
                        title={`Load Finnhub figures for ${table.unrequested.length} stocks (up to ${table.unrequested.length * CALLS_PER_STOCK} calls when nothing is cached)`}
                        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-gray-600 px-2 text-xs font-semibold text-gray-400 hover:text-gray-100"
                    >
                        <Download aria-hidden className="h-3.5 w-3.5" />
                        Figures
                    </button>
                )}
                <Link href={`/market-data?${paramsFromState(state).toString()}`} title="Open this screen on the Markets page" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-gray-400 hover:text-gray-100">
                    Markets
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
            </div>
            <div className="min-h-0 flex-1">
                {state.universe === "us" ? (
                    <TvScreener screen={state.screen} view={state.view} className="rounded-none!" />
                ) : table.rows.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">{state.universe === "watchlist" && !doc ? "Loading your watchlists…" : "No stocks match this preset."}</p>
                ) : (
                    <WatchlistGrid
                        rows={table.rows}
                        columns={COLUMNS}
                        sort={state.sort}
                        density="compact"
                        selected={symbol}
                        onSelect={(picked) => {
                            const row = table.rows.find((entry) => entry.symbol === picked);
                            if (row?.idle) table.request([picked]);
                            onPickSymbol(picked);
                        }}
                        label={preset.name}
                        linkSymbols={false}
                        maxHeightClass="max-h-full h-full"
                    />
                )}
            </div>
        </div>
    );
};

export default ScreenerWidget;
