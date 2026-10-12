'use client';

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import Panel from "@/components/Panel";
import { useLiveMarket } from "@/components/LiveMarket";
import { SECTOR_ETFS } from "@/lib/data/markets";
import { capWeightedChange, formatNewYorkMoment, quoteFreshness, type Freshness, type HeatmapStock } from "@/lib/market-data";
import { cn, formatChangePercent, getChangeColorClass } from "@/lib/utils";

// The bars are scaled to the biggest ETF move, but never past ±0.5%, so a quiet day doesn't look dramatic
const MIN_SCALE = 0.5;

// A bar growing right from the middle for a gain, or left for a loss
const ChangeBar = ({ value, scale }: { value?: number; scale: number }) => {
    const width = value !== undefined ? (Math.min(Math.abs(value), scale) / scale) * 50 : 0;

    return (
        <div className="relative h-1.5" aria-hidden>
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-600" />
            {width > 0 && (
                <span
                    className={cn(
                        "absolute inset-y-0",
                        value! > 0 ? "left-1/2 rounded-r-sm bg-green-600 dark:bg-green-500" : "right-1/2 rounded-l-sm bg-red-600 dark:bg-red-500"
                    )}
                    style={{ width: `${width}%` }}
                />
            )}
        </div>
    );
};

type SectorPerformanceProps = {
    // The interactive map's stocks and how current their prices are, for each sector's combined move
    stocks: readonly HeatmapStock[];
    freshness: ReadonlyMap<string, Freshness>;
    focusedSector?: string;
    onFocusSector: (sector?: string) => void;
    // Spotlights a sector on the map while its row is pointed at or focused
    onHighlight: (sector?: string) => void;
    // True while the page shows TradingView's map, which a row switches away from
    tradingViewShown: boolean;
    now: number;
    className?: string;
};

// Each GICS sector's SPDR Select Sector ETF move next to the combined move of its leaders (the interactive map's
// stocks in that sector).
// They're two different measurements and are labelled as such: the ETFs hold every company in the sector and cap
// the biggest ones' weights, while the map's figure is the market-cap-weighted move of its largest few.
// Choosing a row zooms the interactive map into that sector.
// An ETF price or a leader whose price is stale is left out of the figures and breadth, and the row says so, so no
// figure mixes two sessions' moves.
const SectorPerformance = ({ stocks, freshness, focusedSector, onFocusSector, onHighlight, tradingViewShown, now, className }: SectorPerformanceProps) => {
    const { quotes, session } = useLiveMarket();
    const listRef = useRef<HTMLUListElement>(null);
    // While the pointer or keyboard is in the list, the rows keep their order, so a refresh never moves the row
    // being pointed at (or takes keyboard focus with it)
    const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);

    const rows = useMemo(() => {
        const bySector = new Map<string, HeatmapStock[]>();
        for (const stock of stocks) bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
        const newestEtf = SECTOR_ETFS.reduce<number | undefined>((newest, { symbol }) => {
            const time = quotes[symbol]?.time;
            return time && time > (newest ?? 0) ? time : newest;
        }, undefined);
        return SECTOR_ETFS.map((sector) => {
            const etf = quotes[sector.symbol];
            const etfFreshness =
                etf?.price !== undefined && etf.changePercent !== undefined
                    ? quoteFreshness({ price: etf.price, time: etf.time }, { now, session, newestQuoteTime: newestEtf })
                    : "missing";
            return { ...sector, etf, etfFreshness, map: capWeightedChange(bySector.get(sector.sector) ?? [], freshness) };
        }).sort((a, b) => (b.etf?.changePercent ?? -Infinity) - (a.etf?.changePercent ?? -Infinity));
    }, [stocks, freshness, quotes, now, session]);

    const shownRows = frozenOrder ? [...rows].sort((a, b) => frozenOrder.indexOf(a.symbol) - frozenOrder.indexOf(b.symbol)) : rows;
    const freeze = () => setFrozenOrder((order) => order ?? rows.map(({ symbol }) => symbol));
    const unfreezeUnlessInUse = (focusInside: boolean, pointerInside: boolean) => {
        if (!focusInside && !pointerInside) setFrozenOrder(null);
    };

    const scale = Math.max(MIN_SCALE, ...rows.map(({ etf }) => Math.abs(etf?.changePercent ?? 0)));
    const current = rows.filter(({ etfFreshness }) => etfFreshness === "fresh");
    const staleEtfs = rows.filter(({ etfFreshness }) => etfFreshness === "stale").length;
    const advancing = current.filter(({ etf }) => etf!.changePercent! > 0.005).length;
    const declining = current.filter(({ etf }) => etf!.changePercent! < -0.005).length;
    const newestEtf = rows.reduce<number | undefined>((newest, { etf }) => (etf?.time && etf.time > (newest ?? 0) ? etf.time : newest), undefined);

    // "All sectors" disappears once used, so keyboard focus goes to the row of the sector that was shown
    const showAllSectors = () => {
        const previous = focusedSector;
        onFocusSector(undefined);
        requestAnimationFrame(() => {
            if (document.activeElement && document.activeElement !== document.body) return;
            listRef.current?.querySelector<HTMLElement>(`[data-sector="${CSS.escape(previous ?? "")}"]`)?.focus();
        });
    };

    return (
        <Panel
            title="Sector ETFs"
            description="1D move of each sector fund and its leaders"
            className={className}
            bodyClassName="flex flex-col"
        >
            <div className="flex min-h-10 items-center justify-between gap-2 border-b border-gray-600 px-4 py-1.5 text-xs">
                {focusedSector ? (
                    <>
                        <Link
                            href={`/market-data?sector=${encodeURIComponent(focusedSector)}`}
                            className="inline-flex min-w-0 items-center gap-1 truncate text-gray-400 transition-colors hover:text-gray-100"
                            title={`Quotes for every ${focusedSector} company in the S&P 500`}
                        >
                            <span className="truncate">All {focusedSector} stocks</span>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                        </Link>
                        <button
                            type="button"
                            onClick={showAllSectors}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-gray-600 px-2 py-1 font-semibold text-gray-100 transition-colors hover:border-gray-500"
                        >
                            <RotateCcw className="h-3 w-3" />
                            All sectors
                        </button>
                    </>
                ) : (
                    <span className="text-gray-500">{tradingViewShown ? "Pick a sector to open it in the interactive map" : "Pick a sector to zoom the map into it"}</span>
                )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.75rem] gap-x-2 whitespace-nowrap px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <span>Sector · ETF</span>
                <span className="text-right" title="The ETF's change since the previous close">ETF</span>
                <span className="text-right" title="Market-cap-weighted change of this sector's stocks on the interactive map">Leaders</span>
            </div>

            <ul
                ref={listRef}
                className="flex-1 pb-1"
                onPointerEnter={freeze}
                onFocus={freeze}
                onPointerLeave={() => {
                    onHighlight(undefined);
                    unfreezeUnlessInUse(!!listRef.current?.contains(document.activeElement), false);
                }}
                onBlur={(event) => unfreezeUnlessInUse(!!listRef.current?.contains(event.relatedTarget as Node | null), !!listRef.current?.matches(":hover"))}
            >
                {shownRows.map(({ sector, short, symbol, etf, etfFreshness, map }) => {
                    const active = sector === focusedSector;
                    const etfStale = etfFreshness === "stale";
                    return (
                        <li key={symbol}>
                            <button
                                type="button"
                                data-sector={sector}
                                aria-pressed={active}
                                onClick={() => onFocusSector(active ? undefined : sector)}
                                onPointerEnter={() => onHighlight(sector)}
                                onFocus={() => onHighlight(sector)}
                                onBlur={() => onHighlight(undefined)}
                                title={active ? "Show all sectors" : `Zoom the map into ${sector}`}
                                className={cn(
                                    "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_4.25rem_4.75rem] items-center gap-x-2 gap-y-1 border-l-2 px-4 py-1.5 text-left transition-colors",
                                    active ? "border-gray-100 bg-gray-700/70" : "border-transparent hover:bg-gray-700/50"
                                )}
                            >
                                <span className="min-w-0 truncate text-[13px] text-gray-100">
                                    <span className="sr-only">{sector}</span>
                                    <span aria-hidden>{short}</span>
                                    <span className="ml-1.5 text-[11px] text-gray-500">{symbol}</span>
                                </span>
                                <span
                                    className={cn("text-right text-[13px] font-semibold tabular-nums", etfStale ? "text-gray-500" : getChangeColorClass(etf?.changePercent))}
                                    title={etfStale && etf?.time ? `Stale: price as of ${formatNewYorkMoment(etf.time, now)}` : undefined}
                                >
                                    <span className="sr-only">ETF </span>
                                    {etf?.changePercent !== undefined ? formatChangePercent(etf.changePercent) : "—"}
                                    {etfStale && <span className="sr-only">, stale price</span>}
                                </span>
                                <span
                                    className={cn("text-right text-xs tabular-nums", map.changePercent !== undefined ? getChangeColorClass(map.changePercent) : "text-gray-500")}
                                    title={`Combined move of ${map.counted} of ${map.total} ${sector} leaders on the interactive map with current prices, weighted by market cap`}
                                >
                                    <span className="sr-only">Leaders </span>
                                    {map.changePercent !== undefined ? formatChangePercent(map.changePercent) : "—"}
                                </span>
                                <span className="col-span-1">
                                    {etfStale ? (
                                        <span className="block text-[10px] font-semibold uppercase leading-[6px] tracking-wider text-gray-500" aria-hidden>
                                            Stale
                                        </span>
                                    ) : (
                                        <ChangeBar value={etf?.changePercent} scale={scale} />
                                    )}
                                </span>
                                <span className="col-span-2 text-right text-[10px] tabular-nums text-gray-500">
                                    {map.counted} of {map.total} stocks{map.stale > 0 ? `, ${map.stale} stale` : ""}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="border-t border-gray-600 px-4 py-3">
                {current.length > 0 && (
                    <>
                        <div className="flex justify-between text-xs font-medium">
                            <span className="text-green-800 dark:text-green-500">{advancing} up</span>
                            <span className="text-gray-500">Sector ETF breadth</span>
                            <span className="text-red-700 dark:text-red-500">{declining} down</span>
                        </div>
                        <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                            {advancing > 0 && <span className="bg-green-600 dark:bg-green-500" style={{ flexGrow: advancing }} />}
                            {current.length > advancing + declining && <span className="bg-gray-600" style={{ flexGrow: current.length - advancing - declining }} />}
                            {declining > 0 && <span className="bg-red-600 dark:bg-red-500" style={{ flexGrow: declining }} />}
                        </div>
                    </>
                )}
                <p className="mt-2.5 text-[11px] leading-relaxed text-gray-500">
                    The two figures differ by design. Each ETF holds its whole sector and caps its biggest holdings; Leaders
                    weights only the interactive map&apos;s stocks in that sector by market cap, counting current prices only.
                    Both use GICS sectors. ETF prices from Finnhub
                    {newestEtf !== undefined ? `, newest ${formatNewYorkMoment(newestEtf, now)}` : ""}
                    {staleEtfs > 0 ? `; ${staleEtfs} stale, left out of the breadth` : ""}.
                </p>
            </div>
        </Panel>
    );
};

export default SectorPerformance;
