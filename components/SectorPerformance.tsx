'use client';

import Link from "next/link";
import Panel from "@/components/Panel";
import { useLiveMarket } from "@/components/LiveMarket";
import { SECTOR_ETFS } from "@/lib/data/markets";
import { cn, formatChangePercent, getChangeColorClass } from "@/lib/utils";

// The bars are scaled to the biggest move, but never past ±0.5%, so a quiet day doesn't look dramatic
const MIN_SCALE = 0.5;

// A bar growing right from the middle for a gain, or left for a loss
const ChangeBar = ({ value, scale }: { value?: number; scale: number }) => {
    const width = value !== undefined ? (Math.min(Math.abs(value), scale) / scale) * 50 : 0;

    return (
        <div className="relative h-2" aria-hidden>
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-600" />
            {width > 0 && (
                <span
                    className={cn(
                        "absolute inset-y-0",
                        value! > 0
                            ? "left-1/2 rounded-r bg-green-600 dark:bg-green-500"
                            : "right-1/2 rounded-l bg-red-600 dark:bg-red-500"
                    )}
                    style={{ width: `${width}%` }}
                />
            )}
        </div>
    );
};

// Today's move for each of the 11 S&P 500 sectors, best first. Each row opens that sector's stocks.
const SectorPerformance = ({ className }: { className?: string }) => {
    const { quotes } = useLiveMarket();

    const rows = SECTOR_ETFS
        .map((sector) => ({ ...sector, change: quotes[sector.symbol]?.changePercent }))
        .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
    const scale = Math.max(MIN_SCALE, ...rows.map(({ change }) => Math.abs(change ?? 0)));

    const advancing = rows.filter(({ change }) => change !== undefined && change > 0).length;
    const declining = rows.filter(({ change }) => change !== undefined && change < 0).length;
    const priced = rows.filter(({ change }) => change !== undefined).length;

    return (
        <Panel
            title="Sector performance"
            description="Today's move of each sector's SPDR fund"
            className={className}
            bodyClassName="flex flex-col"
        >
            {/* Two columns while the list sits under the map, one column beside it */}
            <ul className="grid flex-1 grid-cols-1 content-around py-1.5 md:grid-flow-col md:grid-cols-2 md:grid-rows-6 xl:grid-flow-row xl:grid-cols-1 xl:grid-rows-none">
                {rows.map(({ sector, label, symbol, change }) => (
                    <li key={symbol}>
                        <Link
                            href={`/market-data?sector=${encodeURIComponent(sector)}`}
                            title={`See the ${label.toLowerCase()} stocks in the S&P 500`}
                            className="flex flex-col gap-2 px-4 py-2.5 transition-colors hover:bg-gray-700/60"
                        >
                            <span className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 truncate text-sm text-gray-100">
                                    {label}
                                    <span className="ml-2 text-xs text-gray-500">{symbol}</span>
                                </span>
                                <span className={cn("shrink-0 text-sm font-medium tabular-nums", getChangeColorClass(change))}>
                                    {change !== undefined ? formatChangePercent(change) : "—"}
                                </span>
                            </span>
                            <ChangeBar value={change} scale={scale} />
                        </Link>
                    </li>
                ))}
            </ul>

            {priced > 0 && (
                <div className="border-t border-gray-600 px-4 py-3">
                    <div className="flex justify-between text-xs font-medium">
                        <span className="text-green-600 dark:text-green-500">{advancing} up</span>
                        <span className="text-gray-500">Sector breadth</span>
                        <span className="text-red-600 dark:text-red-500">{declining} down</span>
                    </div>
                    <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                        {advancing > 0 && <span className="bg-green-600 dark:bg-green-500" style={{ flexGrow: advancing }} />}
                        {priced > advancing + declining && <span className="bg-gray-600" style={{ flexGrow: priced - advancing - declining }} />}
                        {declining > 0 && <span className="bg-red-600 dark:bg-red-500" style={{ flexGrow: declining }} />}
                    </div>
                </div>
            )}
        </Panel>
    );
};

export default SectorPerformance;
