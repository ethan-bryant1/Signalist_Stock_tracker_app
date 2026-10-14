"use client";

import { memo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import PriceStamp from "@/components/PriceStamp";
import { cellFor } from "@/lib/watchlist-format";
import { COLUMNS, type ColumnKey, type Density, type SortKey, type WatchRow, type WatchlistPrefs } from "@/lib/watchlists";
import { cn, getChangeColorClass } from "@/lib/utils";

// A symbol that's in the list but whose figures haven't arrived yet. idle: nothing has been asked for (the Markets
// screener loads S&P 500 figures on request), so its cells say so instead of showing a loading bar. sector and
// industry are known from the S&P 500 list before any figures load.
export type GridRow = { symbol: string; company: string; data?: WatchRow; idle?: boolean; sector?: string; industry?: string };

type GridProps = {
    rows: GridRow[];
    columns: ColumnKey[];
    sort: WatchlistPrefs["sort"];
    onSort?: (key: SortKey) => void;
    density: Density;
    selected: string | null;
    onSelect: (symbol: string) => void;
    // Rows can be dragged and moved with Alt+arrows (only in the list's own order)
    onMove?: (symbol: string, toIndex: number) => void;
    onRemove?: (symbol: string) => void;
    // Accessible name of the grid, e.g. the list's name
    label: string;
    // The page's grid scrolls inside itself so its headings stay in view; a widget fills its frame
    maxHeightClass?: string;
    // On the page a symbol links to its stock page (Enter opens it); in a workspace widget picking a row is enough
    linkSymbols?: boolean;
};

const ROW_HEIGHT: Record<Density, string> = { compact: "h-8", comfortable: "h-11" };

const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    active ? dir === "asc" ? <ArrowUp aria-hidden className="h-3 w-3 shrink-0" /> : <ArrowDown aria-hidden className="h-3 w-3 shrink-0" /> : <span aria-hidden className="inline-block w-3" />;

const HeaderCell = ({ sortKey, label, title, align, sort, onSort, className }: { sortKey: SortKey; label: string; title: string; align: "left" | "right"; sort: GridProps["sort"]; onSort?: (key: SortKey) => void; className?: string }) => {
    const active = sort.key === sortKey;
    return (
        <th
            scope="col"
            aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
            className={cn("sticky top-0 z-10 h-8 border-b border-gray-600 bg-gray-800 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}
        >
            {onSort ? (
                <button
                    type="button"
                    title={`Sort by ${title}`}
                    onClick={() => onSort(sortKey)}
                    className={cn("inline-flex cursor-pointer items-center gap-1 rounded uppercase hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100", align === "right" && "flex-row-reverse", active && "text-gray-100")}
                >
                    <span>{label}</span>
                    <SortIcon active={active} dir={sort.dir} />
                </button>
            ) : (
                label
            )}
        </th>
    );
};

const Skeleton = ({ align }: { align: "left" | "right" }) => <span aria-hidden className={cn("block h-2.5 w-12 animate-pulse rounded bg-gray-700", align === "right" && "ml-auto")} />;

const DataCell = ({ column, row }: { column: ColumnKey; row: GridRow }) => {
    const def = COLUMNS[column];
    const align = def.align === "right" ? "text-right" : "text-left";
    if (!row.data) {
        if (column === "name") return <td className="max-w-56 truncate px-2 text-gray-400">{row.company}</td>;
        if ((column === "sector" || column === "industry") && row[column]) return <td title={row[column]} className="max-w-44 truncate px-2 text-gray-400">{row[column]}</td>;
        if (row.idle) {
            return (
                <td title={`${def.label}: not loaded yet`} className={cn("px-2 text-gray-500", align)}>
                    —
                </td>
            );
        }
        return (
            <td className={cn("px-2", align)}>
                <Skeleton align={def.align} />
            </td>
        );
    }
    if (column === "time") {
        return (
            <td className="px-2 text-right whitespace-nowrap">
                <PriceStamp hasPrice={row.data.price !== undefined} quoteTime={row.data.quoteTime} cached={row.data.cached} issue={row.data.issue} renderedAt={row.data.checkedAt} className="text-[11px]" />
            </td>
        );
    }
    const cell = cellFor(column, row.data);
    return (
        <td
            title={cell.state === "na" ? `${def.label} doesn't apply to funds` : cell.state === "unloaded" ? `${def.label} didn't load (Finnhub was busy or failed); use Retry below` : cell.state === "missing" ? (column === "sector" ? "Not an S&P 500 constituent" : `${def.label} isn't available from Finnhub`) : column === "name" || column === "industry" || column === "sector" ? cell.text : undefined}
            className={cn(
                "px-2 whitespace-nowrap",
                align,
                column === "name" ? "max-w-56 truncate text-gray-400" : "tabular-nums",
                (column === "industry" || column === "sector") && "max-w-44 truncate text-gray-400",
                cell.state ? "text-gray-500" : cell.signed ? cn("font-medium", getChangeColorClass(row.data.changePercent)) : column !== "name" && column !== "industry" && column !== "sector" && "text-gray-100"
            )}
        >
            {cell.text}
        </td>
    );
};

const Row = memo(function Row({
    row,
    index,
    columns,
    density,
    isSelected,
    tabbable,
    draggable,
    dropEdge,
    linkSymbol,
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
}: {
    row: GridRow;
    index: number;
    columns: ColumnKey[];
    density: Density;
    isSelected: boolean;
    tabbable: boolean;
    draggable: boolean;
    dropEdge: "top" | "bottom" | null;
    linkSymbol: boolean;
    onSelect: (symbol: string) => void;
    onRemove?: (symbol: string) => void;
    onDragStart: (symbol: string) => void;
    onDragOver: (index: number) => void;
    onDrop: () => void;
}) {
    const href = `/stocks/${encodeURIComponent(row.symbol)}`;
    return (
        <tr
            data-symbol={row.symbol}
            aria-selected={isSelected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onSelect(row.symbol)}
            onDragOver={(event) => {
                if (!draggable) return;
                event.preventDefault();
                // The upper half of a row drops before it, the lower half after it
                const box = event.currentTarget.getBoundingClientRect();
                onDragOver(event.clientY > box.top + box.height / 2 ? index + 1 : index);
            }}
            onDrop={(event) => {
                event.preventDefault();
                onDrop();
            }}
            className={cn(
                "group cursor-default border-b border-gray-700/70 text-[13px] outline-none transition-colors",
                ROW_HEIGHT[density],
                isSelected ? "bg-gray-700" : "hover:bg-gray-700/40",
                "focus-visible:shadow-[inset_2px_0_0_0_var(--color-gray-100)]",
                dropEdge === "top" && "shadow-[inset_0_2px_0_0_var(--color-gray-100)]",
                dropEdge === "bottom" && "shadow-[inset_0_-2px_0_0_var(--color-gray-100)]"
            )}
        >
            {draggable && (
                <td className="w-6 pl-1 text-gray-500">
                    <span
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.symbol);
                            onDragStart(row.symbol);
                        }}
                        title="Drag to move (or Alt+↑/↓)"
                        aria-hidden
                        className="flex h-6 w-5 cursor-grab items-center justify-center rounded opacity-50 hover:bg-gray-700 hover:opacity-100 active:cursor-grabbing"
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </span>
                </td>
            )}
            {/* Opaque, so cells scrolled under it don't show through; the hover color matches the row's see-through one */}
            <th
                scope="row"
                className={cn(
                    "sticky left-0 z-[1] px-2 text-left font-semibold whitespace-nowrap",
                    isSelected ? "bg-gray-700" : "bg-gray-800 group-hover:bg-[color-mix(in_srgb,var(--color-gray-700)_40%,var(--color-gray-800))]"
                )}
            >
                {/* Not a tab stop of its own: the row is; Enter on the row opens this page */}
                {linkSymbol ? (
                    <Link href={href} tabIndex={-1} onClick={(event) => event.stopPropagation()} className="text-gray-100 hover:underline" prefetch={false}>
                        {row.symbol}
                    </Link>
                ) : (
                    <span className="text-gray-100">{row.symbol}</span>
                )}
            </th>
            {columns.map((column) => (
                <DataCell key={column} column={column} row={row} />
            ))}
            {onRemove && (
                <td className="w-8 pr-1 text-right">
                    <button
                        type="button"
                        tabIndex={-1}
                        title={`Remove ${row.symbol} (Delete)`}
                        aria-label={`Remove ${row.symbol}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove(row.symbol);
                        }}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-gray-500 opacity-0 transition-opacity hover:bg-gray-700 hover:text-gray-100 group-hover:opacity-100 group-aria-selected:opacity-100 focus-visible:opacity-100"
                    >
                        <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                </td>
            )}
        </tr>
    );
});

// The watchlist's quote grid: sortable headings that stay in view, right-aligned figures in fixed decimals, a dash for
// anything missing. One row is the tab stop; arrows move the selection, Enter opens the stock's page, Delete removes
// it and Alt+arrows move it (in the list's own order).
const WatchlistGrid = ({ rows, columns, sort, onSort, density, selected, onSelect, onMove, onRemove, label, maxHeightClass, linkSymbols = true }: GridProps) => {
    const bodyRef = useRef<HTMLTableSectionElement>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dropAt, setDropAt] = useState<number | null>(null);
    const draggable = !!onMove && sort.key === "manual";
    const selectedIndex = rows.findIndex((row) => row.symbol === selected);
    const tabIndexRow = selectedIndex === -1 ? 0 : selectedIndex;

    const focusRow = (index: number) => {
        const target = rows[index];
        if (!target) return;
        onSelect(target.symbol);
        bodyRef.current?.querySelector<HTMLElement>(`tr[data-symbol="${CSS.escape(target.symbol)}"]`)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
        const index = selectedIndex === -1 ? 0 : selectedIndex;
        const current = rows[index];
        if (!current) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            if (event.altKey && draggable) {
                const to = index + step;
                if (to >= 0 && to < rows.length) {
                    onMove!(current.symbol, to);
                    // Keep focus on the moved row after it re-renders
                    requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>(`tr[data-symbol="${CSS.escape(current.symbol)}"]`)?.focus());
                }
                return;
            }
            focusRow(Math.max(0, Math.min(rows.length - 1, index + step)));
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            focusRow(event.key === "Home" ? 0 : rows.length - 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (!linkSymbols) return onSelect(current.symbol);
            (bodyRef.current?.querySelector<HTMLAnchorElement>(`tr[data-symbol="${CSS.escape(current.symbol)}"] a`))?.click();
        } else if ((event.key === "Delete" || event.key === "Backspace") && onRemove) {
            event.preventDefault();
            const next = rows[index + 1] ?? rows[index - 1];
            onRemove(current.symbol);
            if (next) requestAnimationFrame(() => focusRow(rows.indexOf(next)));
        }
    };

    const drop = () => {
        if (dragging && dropAt !== null && onMove) {
            const from = rows.findIndex((row) => row.symbol === dragging);
            const to = dropAt > from ? dropAt - 1 : dropAt;
            if (from !== -1 && to !== from) onMove(dragging, to);
        }
        setDragging(null);
        setDropAt(null);
    };

    return (
        <div className={cn("relative overflow-auto", maxHeightClass)} onDragEnd={() => (setDragging(null), setDropAt(null))}>
            <table role="grid" aria-label={label} aria-rowcount={rows.length + 1} className="w-full border-separate border-spacing-0">
                <thead>
                    <tr>
                        {draggable && <th scope="col" aria-label="Move" className="sticky top-0 z-10 w-6 border-b border-gray-600 bg-gray-800" />}
                        <HeaderCell sortKey="symbol" label="Symbol" title="symbol" align="left" sort={sort} onSort={onSort} className="left-0 z-20" />
                        {columns.map((column) => (
                            <HeaderCell key={column} sortKey={column} label={COLUMNS[column].short} title={COLUMNS[column].label.toLowerCase()} align={COLUMNS[column].align} sort={sort} onSort={onSort} />
                        ))}
                        {onRemove && <th scope="col" aria-label="Remove" className="sticky top-0 z-10 w-8 border-b border-gray-600 bg-gray-800" />}
                    </tr>
                </thead>
                <tbody ref={bodyRef} onKeyDown={onKeyDown}>
                    {rows.map((row, index) => (
                        <Row
                            key={row.symbol}
                            row={row}
                            index={index}
                            columns={columns}
                            density={density}
                            isSelected={row.symbol === selected}
                            tabbable={index === tabIndexRow}
                            draggable={draggable}
                            linkSymbol={linkSymbols}
                            dropEdge={dragging === null || dropAt === null ? null : dropAt === index ? "top" : dropAt === rows.length && index === rows.length - 1 ? "bottom" : null}
                            onSelect={onSelect}
                            onRemove={onRemove}
                            onDragStart={setDragging}
                            onDragOver={setDropAt}
                            onDrop={drop}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default WatchlistGrid;
