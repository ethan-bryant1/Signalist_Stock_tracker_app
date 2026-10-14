"use client";

import { memo } from "react";
import { ChevronDown } from "lucide-react";
import InspectPanel from "@/components/watchlist/InspectPanel";
import type { GridRow } from "@/components/watchlist/WatchlistGrid";
import { cn, formatChangePercent, formatCurrency, getChangeColorClass } from "@/lib/utils";

type Props = {
    rows: GridRow[];
    selected: string | null;
    onSelect: (symbol: string | null) => void;
    onRemove?: (symbol: string) => void;
    onMove?: (symbol: string, direction: -1 | 1) => void;
    listName: string;
    otherListsFor: (symbol: string) => string[];
    // Extra buttons in an open card (the Markets screener's "Add to watchlist")
    actionsFor?: (row: GridRow) => React.ReactNode;
};

const Card = memo(function Card({ row, open, index, count, onSelect, onRemove, onMove, listName, otherLists, actions }: { row: GridRow; open: boolean; index: number; count: number; onSelect: Props["onSelect"]; onRemove: Props["onRemove"]; onMove?: Props["onMove"]; listName: string; otherLists: string[]; actions?: React.ReactNode }) {
    const data = row.data;
    return (
        <li className={cn("border-b border-gray-700/70 last:border-b-0", open && "bg-gray-700/40")}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => onSelect(open ? null : row.symbol)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-100"
            >
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-100">{row.symbol}</span>
                    <span className="block truncate text-xs text-gray-500">{data?.name ?? row.company}</span>
                </span>
                <span className="text-right tabular-nums">
                    {data ? (
                        <>
                            <span className="block text-sm font-semibold text-gray-100">{data.price !== undefined ? formatCurrency(data.price, data.currency) : "—"}</span>
                            <span className={cn("block text-xs font-medium", getChangeColorClass(data.changePercent))}>{data.changePercent !== undefined ? formatChangePercent(data.changePercent) : "—"}</span>
                        </>
                    ) : row.idle ? (
                        <span title="Not loaded yet" className="block text-sm text-gray-500">—</span>
                    ) : (
                        <span aria-label="Loading" className="block h-8 w-16 animate-pulse rounded bg-gray-700" />
                    )}
                </span>
                <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-gray-500 transition-transform", open && "rotate-180")} />
            </button>
            {open && <InspectPanel row={row} variant="inline" otherLists={otherLists} onRemove={onRemove} onMove={onMove} canMoveUp={index > 0} canMoveDown={index < count - 1} listName={listName} actions={actions} />}
        </li>
    );
});

// The list on a phone: one card per symbol with its price and day's change; tapping a card opens its figures, the
// way to its page, moving and removing.
const WatchCards = ({ rows, selected, onSelect, onRemove, onMove, listName, otherListsFor, actionsFor }: Props) => (
    <ul aria-label={listName} className="flex flex-col">
        {rows.map((row, index) => (
            <Card key={row.symbol} row={row} open={row.symbol === selected} index={index} count={rows.length} onSelect={onSelect} onRemove={onRemove} onMove={onMove} listName={listName} otherLists={row.symbol === selected ? otherListsFor(row.symbol) : []} actions={row.symbol === selected ? actionsFor?.(row) : undefined} />
        ))}
    </ul>
);

export default WatchCards;
