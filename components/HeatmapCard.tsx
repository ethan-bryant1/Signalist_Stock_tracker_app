import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { QuoteIdentity, QuotePrice, QuoteStats, QuoteTime, sectorName } from "@/components/QuoteDetails";
import type { Freshness, HeatmapStock } from "@/lib/market-data";
import { formatMarketCapValue } from "@/lib/utils";

// How the card was opened: hovering with a mouse, moving with the keyboard, or tapping on a touch screen
export type InspectSource = "pointer" | "keyboard" | "touch";

type HeatmapCardProps = {
    stock: HeatmapStock;
    freshness: Freshness;
    now: number;
    source: InspectSource;
    // What a click does on this map: open the stock's page (dashboard) or select it (Heatmap page)
    action: "open" | "select";
    // The change's period when it isn't the day's, like "1W"
    changeLabel?: string;
    onClose?: () => void;
};

const HINTS = {
    open: { pointer: "Click to open", keyboard: "Enter to open" },
    select: { pointer: "Click to select", keyboard: "Enter to select" },
} as const;

// The heatmap's quick look at a stock (level one: it comes and goes with the cursor). Kept small: who it is,
// the price and move, its size and sector, and how current the price is. The selected-stock panel has the rest.
// On a touch screen, where there's no hovering, a tap docks the fuller version at the bottom of the screen instead.
const HeatmapCard = ({ stock, freshness, now, source, action, changeLabel, onClose }: HeatmapCardProps) => (
    <div className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-gray-400 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-2">
            <QuoteIdentity stock={stock} />
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close stock details"
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-100"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>

        <div className="mt-3">
            <QuotePrice stock={stock} changeLabel={changeLabel} />
        </div>

        {source === "touch" ? (
            <div className="mt-3 border-t border-gray-600 pt-2.5">
                <QuoteStats stock={stock} />
            </div>
        ) : (
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-gray-600 pt-2.5 text-xs">
                <dt className="text-gray-500">Market cap</dt>
                <dd className="text-right font-medium tabular-nums text-gray-100">{stock.marketCap ? formatMarketCapValue(stock.marketCap) : "—"}</dd>
                <dt className="text-gray-500">Sector</dt>
                <dd className="truncate text-right font-medium text-gray-100" title={stock.industry}>{sectorName(stock.sector)}</dd>
            </dl>
        )}

        {source === "touch" && (
            <p className="mt-2.5 truncate text-[11px] text-gray-500" title={`${stock.sector} · ${stock.industry}`}>
                <span className="font-medium text-gray-400">{sectorName(stock.sector)}</span>
                {stock.industry && <> · {stock.industry}</>}
            </p>
        )}

        <div className="mt-2 flex items-end justify-between gap-2 border-t border-gray-600 pt-2">
            <QuoteTime stock={stock} freshness={freshness} now={now} />
            {source !== "touch" && <span className="shrink-0 text-[11px] text-gray-500">{HINTS[action][source]}</span>}
        </div>

        {source === "touch" && action === "open" && (
            <Link
                href={`/stocks/${encodeURIComponent(stock.symbol)}`}
                className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90"
            >
                Open {stock.symbol}
                <ArrowUpRight className="h-4 w-4" />
            </Link>
        )}
    </div>
);

export default HeatmapCard;
