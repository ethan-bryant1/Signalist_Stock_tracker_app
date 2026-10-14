'use client';

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Panel from "@/components/Panel";
import { useLiveMarket } from "@/components/LiveMarket";
import { SECTOR_ETFS } from "@/lib/data/markets";
import { formatNewYorkMoment, quoteFreshness, type Freshness } from "@/lib/market-data";
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

const Frame = ({ framed, className, children }: { framed: boolean; className?: string; children: React.ReactNode }) =>
    framed ? (
        <Panel title="Sector ETFs" description="1D move of each sector fund" className={className} bodyClassName="flex flex-col">
            {children}
        </Panel>
    ) : (
        <div className={cn("flex flex-col", className)}>{children}</div>
    );

type SectorPerformanceProps = {
    now: number;
    className?: string;
    // false inside a workspace widget, which brings its own frame and title
    framed?: boolean;
};

// Each GICS sector's SPDR Select Sector ETF move since the previous close, biggest gain first. A row opens that
// sector's quotes on the Markets page. An ETF whose price is stale shows its figure in gray and is left out of the
// breadth, so no figure mixes two sessions' moves.
const SectorPerformance = ({ now, className, framed = true }: SectorPerformanceProps) => {
    const { quotes, session } = useLiveMarket();
    const listRef = useRef<HTMLUListElement>(null);
    // While the pointer or keyboard is in the list, the rows keep their order, so a refresh never moves the row
    // being pointed at (or takes keyboard focus with it)
    const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);

    const rows = useMemo(() => {
        const newestEtf = SECTOR_ETFS.reduce<number | undefined>((newest, { symbol }) => {
            const time = quotes[symbol]?.time;
            return time && time > (newest ?? 0) ? time : newest;
        }, undefined);
        return SECTOR_ETFS.map((sector) => {
            const etf = quotes[sector.symbol];
            const etfFreshness: Freshness =
                etf?.price !== undefined && etf.changePercent !== undefined
                    ? quoteFreshness({ price: etf.price, time: etf.time }, { now, session, newestQuoteTime: newestEtf })
                    : "missing";
            return { ...sector, etf, etfFreshness };
        }).sort((a, b) => (b.etf?.changePercent ?? -Infinity) - (a.etf?.changePercent ?? -Infinity));
    }, [quotes, now, session]);

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

    return (
        <Frame framed={framed} className={className}>
            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem] gap-x-2 whitespace-nowrap px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <span>Sector · ETF</span>
                <span className="text-right" title="The ETF's change since the previous close">1D</span>
            </div>

            <ul
                ref={listRef}
                className="flex-1 pb-1"
                onPointerEnter={freeze}
                onFocus={freeze}
                onPointerLeave={() => unfreezeUnlessInUse(!!listRef.current?.contains(document.activeElement), false)}
                onBlur={(event) => unfreezeUnlessInUse(!!listRef.current?.contains(event.relatedTarget as Node | null), !!listRef.current?.matches(":hover"))}
            >
                {shownRows.map(({ sector, short, symbol, etf, etfFreshness }) => {
                    const etfStale = etfFreshness === "stale";
                    return (
                        <li key={symbol}>
                            <Link
                                href={`/stocks/${encodeURIComponent(symbol)}`}
                                title={`${symbol}, the ${sector} sector fund`}
                                className="grid w-full grid-cols-[minmax(0,1fr)_4.25rem] items-center gap-x-2 gap-y-1 px-4 py-1.5 transition-colors hover:bg-gray-700/50"
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
                                    {etf?.changePercent !== undefined ? formatChangePercent(etf.changePercent) : "—"}
                                    {etfStale && <span className="sr-only">, stale price</span>}
                                </span>
                                <span className="col-span-2">
                                    {etfStale ? (
                                        <span className="block text-[10px] font-semibold uppercase leading-[6px] tracking-wider text-gray-500" aria-hidden>
                                            Stale
                                        </span>
                                    ) : (
                                        <ChangeBar value={etf?.changePercent} scale={scale} />
                                    )}
                                </span>
                            </Link>
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
                    GICS sectors, through each sector&apos;s SPDR fund. Prices from Finnhub
                    {newestEtf !== undefined ? `, newest ${formatNewYorkMoment(newestEtf, now)}` : ""}
                    {staleEtfs > 0 ? `; ${staleEtfs} stale, left out of the breadth` : ""}.
                </p>
            </div>
        </Frame>
    );
};

export default SectorPerformance;
