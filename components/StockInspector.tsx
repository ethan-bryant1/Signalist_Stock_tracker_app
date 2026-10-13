'use client';

import Link from "next/link";
import { ArrowUpRight, Crosshair, X } from "lucide-react";
import WatchlistButton from "@/components/WatchlistButton";
import { QuoteIdentity, QuotePrice, QuoteStats, QuoteTime } from "@/components/QuoteDetails";
import { formatNewYorkMoment, type Freshness, type HeatmapStock } from "@/lib/market-data";
import { cn } from "@/lib/utils";

type StockInspectorProps = {
    stock: HeatmapStock;
    freshness: Freshness;
    now: number;
    watchlisted: boolean;
    // The sector the map is zoomed into, if any
    focusedSector?: string;
    onClose: () => void;
    // A sector to show only that sector on the map, or undefined to show every sector again
    onFocusSector: (sector?: string) => void;
    onWatchlistChange: (symbol: string, added: boolean) => void;
    // Gets focus when the panel opens as a bottom sheet
    headingRef?: React.Ref<HTMLHeadingElement>;
    // The period of the stock's change when it isn't the 1-day change ("1W")
    changeLabel?: string;
    className?: string;
};

// The selected stock's details (level two: it stays put while the cursor moves on). Everything here comes from
// the same Finnhub quote and profile as the tile and hover card. Finnhub's free plan has no volume, so there's none.
const StockInspector = ({ stock, freshness, now, watchlisted, focusedSector, onClose, onFocusSector, onWatchlistChange, headingRef, changeLabel, className }: StockInspectorProps) => {
    const outsideFocus = focusedSector !== undefined && focusedSector !== stock.sector;
    const sectorFocused = focusedSector === stock.sector;

    return (
        <div className={cn("flex flex-col text-gray-400", className)}>
            <div className="flex items-center justify-between gap-2">
                <h3 ref={headingRef} tabIndex={-1} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 outline-none">
                    Selected stock
                </h3>
                <div className="-mr-1.5 flex items-center gap-0.5">
                    <span className="flex h-8 w-8 items-center justify-center">
                        <WatchlistButton
                            // Starts over for a new stock; for the same stock it follows isInWatchlist, so saving
                            // keeps keyboard focus on the star
                            key={stock.symbol}
                            type="icon"
                            symbol={stock.symbol}
                            company={stock.name}
                            isInWatchlist={watchlisted}
                            onWatchlistChange={onWatchlistChange}
                        />
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={`Close ${stock.symbol} details`}
                        title="Close (Esc)"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="mt-2">
                <QuoteIdentity stock={stock} logoClassName="h-10 w-10" />
            </div>

            <div className="mt-3">
                <QuotePrice stock={stock} large changeLabel={changeLabel} />
                <QuoteTime stock={stock} freshness={freshness} now={now} className="mt-1" />
            </div>

            <div className="mt-3 border-t border-gray-600 pt-3">
                <QuoteStats stock={stock} />
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 border-t border-gray-600 pt-3 text-xs">
                <dt className="text-gray-500">Sector</dt>
                <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right font-medium text-gray-100">
                    <span className="truncate" title={stock.sector}>{stock.sector}</span>
                    {/* A toggle that stays in place, so pressing it never drops keyboard focus */}
                    <button
                        type="button"
                        onClick={() => onFocusSector(sectorFocused ? undefined : stock.sector)}
                        aria-pressed={sectorFocused}
                        title={sectorFocused ? "Show all sectors on the map" : `Show only ${stock.sector} on the map`}
                        aria-label={`Focus the map on ${stock.sector}`}
                        className={cn(
                            "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
                            sectorFocused ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-100"
                        )}
                    >
                        <Crosshair className="h-3.5 w-3.5" />
                    </button>
                </dd>
                <dt className="text-gray-500">Industry</dt>
                <dd className="truncate text-right font-medium text-gray-100" title={stock.industry}>{stock.industry || "—"}</dd>
                <dt className="text-gray-500">Exchange</dt>
                <dd className="text-right font-medium text-gray-100">{stock.exchange ?? "—"}</dd>
            </dl>

            {outsideFocus && (
                <p className="mt-2 text-[11px] text-gray-500">Not in the focused sector, so it isn&apos;t on the map right now.</p>
            )}

            <p className="mt-3 border-t border-gray-600 pt-2 text-[11px] leading-relaxed text-gray-500">
                Quote and profile from Finnhub
                {stock.fetchedAt !== undefined && <>, received {formatNewYorkMoment(stock.fetchedAt, now)}</>}. Sector and industry: GICS, from the S&amp;P 500 list.
            </p>

            <Link
                href={`/stocks/${encodeURIComponent(stock.symbol)}`}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90"
            >
                Open {stock.symbol} chart and analysis
                <ArrowUpRight className="h-4 w-4" />
            </Link>
        </div>
    );
};

export default StockInspector;
