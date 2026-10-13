"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Trash2 } from "lucide-react";
import PriceStamp from "@/components/PriceStamp";
import { KIND_LABEL } from "@/lib/instrument";
import { cellFor, rangePosition } from "@/lib/watchlist-format";
import type { ColumnKey } from "@/lib/watchlists";
import type { GridRow } from "@/components/watchlist/WatchlistGrid";
import { cn, formatChangePercent, formatCurrency, formatSignedNumber, getChangeColorClass } from "@/lib/utils";

const RangeBar = ({ label, low, high, value, currency }: { label: string; low?: number; high?: number; value?: number; currency: string }) => {
    const at = rangePosition(value, low, high);
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11px] text-gray-500">
                <span>{label}</span>
            </div>
            <div className="relative mt-1.5 h-1 rounded-full bg-gray-700" aria-hidden>
                {at !== undefined && <span className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-gray-100" style={{ left: `calc(${at * 100}% - 1px)` }} />}
            </div>
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-400">
                <span>{low !== undefined ? formatCurrency(low, currency) : "—"}</span>
                <span>{high !== undefined ? formatCurrency(high, currency) : "—"}</span>
            </div>
        </div>
    );
};

const FIGURES: ColumnKey[] = ["open", "previousClose", "marketCap", "peRatio", "eps", "dividendYield", "avgVolume", "industry"];
const FIGURE_LABEL: Partial<Record<ColumnKey, string>> = { previousClose: "Prev close", avgVolume: "Avg vol (10D)", dividendYield: "Div yield", peRatio: "P/E (TTM)", eps: "EPS (TTM)", marketCap: "Market cap" };

// The selected stock at a glance, from the figures the grid already has (no extra requests), with the way to its
// full page. "side" sits beside the grid on wide screens; "inline" opens under a card on phones.
const InspectPanel = ({
    row,
    variant,
    otherLists,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
    listName,
}: {
    row: GridRow | null;
    variant: "side" | "inline";
    otherLists: string[];
    onRemove: (symbol: string) => void;
    onMove?: (symbol: string, direction: -1 | 1) => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    listName: string;
}) => {
    if (!row) {
        return variant === "side" ? (
            <aside aria-label="Selected stock" className="flex min-h-40 items-center justify-center rounded-xl border border-gray-600 bg-gray-800 p-4 text-center text-xs text-gray-500">
                Select a row to see its figures here.
            </aside>
        ) : null;
    }
    const data = row.data;
    const currency = data?.currency ?? "USD";
    const href = `/stocks/${encodeURIComponent(row.symbol)}`;

    return (
        <aside aria-label={`${row.symbol} details`} className={cn("flex flex-col gap-4", variant === "side" ? "rounded-xl border border-gray-600 bg-gray-800 p-4" : "border-t border-gray-700 px-4 pt-3 pb-4")}>
            {variant === "side" && (
                <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-100">{row.symbol}</h2>
                        {data && <span className="text-[11px] text-gray-500">{[data.exchange, KIND_LABEL[data.kind]].filter(Boolean).join(" · ")}</span>}
                    </div>
                    <p className="truncate text-xs text-gray-400" title={data?.name ?? row.company}>
                        {data?.name ?? row.company}
                    </p>
                </div>
            )}

            {variant === "side" && (
                <div>
                    <p className="text-2xl font-semibold tabular-nums text-gray-100">{data?.price !== undefined ? formatCurrency(data.price, currency) : "—"}</p>
                    <p className={cn("text-sm font-medium tabular-nums", getChangeColorClass(data?.changePercent))}>
                        {data?.change !== undefined ? formatSignedNumber(data.change) : "—"} {data?.changePercent !== undefined ? `(${formatChangePercent(data.changePercent)})` : ""}
                    </p>
                    {data && <PriceStamp hasPrice={data.price !== undefined} quoteTime={data.quoteTime} cached={data.cached} issue={data.issue} renderedAt={data.checkedAt} className="mt-1" />}
                </div>
            )}

            {data ? (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <RangeBar label="Day range" low={data.dayLow} high={data.dayHigh} value={data.price} currency={currency} />
                        <RangeBar label="52-week range" low={data.week52Low} high={data.week52High} value={data.price} currency={currency} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {FIGURES.map((key) => {
                            const cell = cellFor(key, data);
                            return (
                                <div key={key} className="flex min-w-0 items-baseline justify-between gap-2 border-b border-gray-700/70 pb-1.5">
                                    <dt className="shrink-0 text-gray-500">{FIGURE_LABEL[key] ?? key[0].toUpperCase() + key.slice(1)}</dt>
                                    <dd className={cn("truncate text-right tabular-nums", cell.state ? "text-gray-500" : "text-gray-100")} title={cell.text}>
                                        {cell.text}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                </>
            ) : (
                <p className="text-xs text-gray-500">Loading figures…</p>
            )}

            {otherLists.length > 0 && <p className="text-[11px] text-gray-500">Also in {otherLists.join(", ")}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <Link href={href} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-100 px-3 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100">
                    Open {row.symbol}
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
                {onMove && (
                    <>
                        <button type="button" disabled={!canMoveUp} onClick={() => onMove(row.symbol, -1)} title="Move up in the list" aria-label={`Move ${row.symbol} up`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-gray-600 text-gray-400 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40">
                            <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" disabled={!canMoveDown} onClick={() => onMove(row.symbol, 1)} title="Move down in the list" aria-label={`Move ${row.symbol} down`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-gray-600 text-gray-400 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40">
                            <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
                <button type="button" onClick={() => onRemove(row.symbol)} title={`Remove from ${listName} (you can undo)`} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 hover:text-gray-100">
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    Remove
                </button>
            </div>
        </aside>
    );
};

export default InspectPanel;
