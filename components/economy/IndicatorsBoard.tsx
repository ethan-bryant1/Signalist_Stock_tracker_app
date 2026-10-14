'use client';

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Panel from "@/components/Panel";
import IndicatorChart from "@/components/economy/IndicatorChart";
import TrendLine from "@/components/economy/TrendLine";
import {
    INDICATOR_GROUPS,
    INDICATORS,
    directionOf,
    formatCalendarDay,
    formatIndicatorChange,
    formatIndicatorValue,
    formatPeriod,
    fredSeriesUrl,
    type IndicatorDef,
    type IndicatorReading,
} from "@/lib/indicators";
import { formatNewYorkMoment } from "@/lib/market-data";
import { ISSUE_WORDS } from "@/lib/price-stamp";
import { cn } from "@/lib/utils";

type Row = { def: IndicatorDef; reading?: IndicatorReading };

// The change from the previous period with an arrow. Plain text color on purpose: whether a move is good depends
// on the indicator, so green and red (kept for gains and losses) aren't used.
export const ChangeText = ({ change, unit, className }: { change?: number; unit: IndicatorDef["unit"]; className?: string }) => {
    const direction = directionOf(change);
    return (
        <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
            {direction && direction !== "flat" && (
                <span aria-hidden className="text-[9px]">
                    {direction === "up" ? "▲" : "▼"}
                </span>
            )}
            {formatIndicatorChange(change, unit)}
        </span>
    );
};

const missingText = (reading?: IndicatorReading) => `No figure: ${reading?.issue ? ISSUE_WORDS[reading.issue] : "FRED sent no values"}. Figures are never filled in.`;

// The Economy page's body: the indicators grouped in one table, and the picked one's history and details beside it
const IndicatorsBoard = ({ readings, now }: { readings: IndicatorReading[]; now: number }) => {
    const rows = useMemo<Row[]>(() => {
        const byId = new Map(readings.map((reading) => [reading.id, reading]));
        return INDICATORS.map((def) => ({ def, reading: byId.get(def.id) }));
    }, [readings]);
    const [selectedId, setSelectedId] = useState(() => rows.find((row) => row.reading?.latest)?.def.id ?? INDICATORS[0].id);
    const detailRef = useRef<HTMLDivElement>(null);
    const selected = rows.find((row) => row.def.id === selectedId) ?? rows[0];

    const pick = (id: string) => {
        setSelectedId(id);
        // Below the wide layout the details sit above the table, so bring them into view
        if (window.matchMedia("(max-width: 1279px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div ref={detailRef} className="scroll-mt-24 xl:order-last">
                <Detail row={selected} now={now} />
            </div>
            <Panel title="Indicators" description="Latest published figure, its period and the change from the period before" className="xl:col-span-2">
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-[13px]">
                        <caption className="sr-only">US economic indicators from FRED. Choose an indicator to see its history.</caption>
                        <thead>
                            <tr className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                                <th scope="col" className="border-b border-gray-600 px-4 py-2 text-left font-medium">Indicator</th>
                                <th scope="col" className="border-b border-gray-600 px-3 py-2 text-right font-medium">Latest</th>
                                <th scope="col" className="border-b border-gray-600 px-3 py-2 text-right font-medium">Change</th>
                                <th scope="col" className="hidden border-b border-gray-600 px-3 py-2 text-left font-medium md:table-cell">Trend</th>
                                <th scope="col" className="hidden border-b border-gray-600 px-4 py-2 text-right font-medium lg:table-cell">Next release</th>
                            </tr>
                        </thead>
                        {INDICATOR_GROUPS.map((group) => (
                            <tbody key={group.id}>
                                <tr>
                                    <th scope="colgroup" colSpan={5} className="border-b border-gray-700/70 bg-gray-900/40 px-4 pb-1.5 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        {group.label}
                                    </th>
                                </tr>
                                {rows
                                    .filter((row) => row.def.group === group.id)
                                    .map((row) => (
                                        <IndicatorRow key={row.def.id} row={row} selected={row.def.id === selected.def.id} onPick={pick} />
                                    ))}
                            </tbody>
                        ))}
                    </table>
                </div>
            </Panel>
        </div>
    );
};

const IndicatorRow = ({ row, selected, onPick }: { row: Row; selected: boolean; onPick: (id: string) => void }) => {
    const { def, reading } = row;
    const latest = reading?.latest;
    const previous = reading?.previous;
    return (
        <tr onClick={() => onPick(def.id)} className={cn("cursor-default transition-colors", selected ? "bg-gray-700" : "hover:bg-gray-700/40")}>
            <td className="border-b border-gray-700/70 px-4 py-2">
                <button
                    type="button"
                    aria-pressed={selected}
                    onClick={(event) => {
                        event.stopPropagation();
                        onPick(def.id);
                    }}
                    className="flex flex-col items-start text-left outline-none focus-visible:underline"
                >
                    <span className="font-medium text-gray-100">{def.label}</span>
                    <span className="hidden text-[11px] text-gray-500 sm:block">{def.measure}</span>
                </button>
            </td>
            <td className="border-b border-gray-700/70 px-3 py-2 text-right whitespace-nowrap">
                {latest ? (
                    <>
                        <span className="block font-semibold tabular-nums text-gray-100">{formatIndicatorValue(latest.value, def.unit)}</span>
                        <span className="block text-[11px] text-gray-500">{formatPeriod(latest.date, def.frequency)}</span>
                    </>
                ) : (
                    <span title={missingText(reading)} className="inline-flex items-center gap-1 font-medium text-gray-100">
                        <AlertTriangle aria-hidden className="h-3 w-3" />—<span className="sr-only">. {missingText(reading)}</span>
                    </span>
                )}
            </td>
            <td className="border-b border-gray-700/70 px-3 py-2 text-right whitespace-nowrap">
                <ChangeText change={reading?.change} unit={def.unit} className="text-gray-100" />
                {previous && <span className="block text-[11px] text-gray-500">vs {formatPeriod(previous.date, def.frequency).replace(/^Week to /, "")}</span>}
            </td>
            <td className="hidden w-32 border-b border-gray-700/70 px-3 py-2 md:table-cell">
                <TrendLine points={reading?.history ?? []} className="h-6 w-28" />
            </td>
            <td className="hidden border-b border-gray-700/70 px-4 py-2 text-right whitespace-nowrap text-gray-400 lg:table-cell">
                {def.frequency === "daily" ? "Daily" : reading?.nextRelease ? formatCalendarDay(reading.nextRelease) : "—"}
            </td>
        </tr>
    );
};

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-700/70 py-1.5 last:border-b-0">
        <dt className="shrink-0 text-gray-500">{label}</dt>
        <dd className="min-w-0 text-right text-gray-100">{children}</dd>
    </div>
);

const Detail = ({ row, now }: { row: Row; now: number }) => {
    const { def, reading } = row;
    const latest = reading?.latest;
    return (
        <Panel title={def.label} description={reading?.title ?? def.measure} className="xl:sticky xl:top-24">
            <div className="flex flex-col gap-4 p-4">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-3xl font-semibold tabular-nums tracking-tight text-gray-100">{formatIndicatorValue(latest?.value, def.unit)}</p>
                        <p className="text-xs text-gray-500">{latest ? formatPeriod(latest.date, def.frequency) : missingText(reading)}</p>
                    </div>
                    {reading?.previous && (
                        <div className="text-right text-xs">
                            <ChangeText change={reading.change} unit={def.unit} className="text-sm font-medium text-gray-100" />
                            <p className="text-gray-500">from {formatIndicatorValue(reading.previous.value, def.unit)} in {formatPeriod(reading.previous.date, def.frequency)}</p>
                        </div>
                    )}
                </div>
                <IndicatorChart key={def.id} points={reading?.history ?? []} unit={def.unit} frequency={def.frequency} label={def.label} />
                <dl className="text-xs">
                    <Fact label="Updated by FRED">{reading?.lastUpdated ? formatNewYorkMoment(reading.lastUpdated, now) : "—"}</Fact>
                    <Fact label="Next release">
                        {def.frequency === "daily" ? "Each business day" : reading?.nextRelease ? formatCalendarDay(reading.nextRelease) : "—"}
                        {reading?.releaseName && <span className="block text-gray-500">{reading.releaseName}</span>}
                    </Fact>
                    {reading?.seasonalAdjustment && <Fact label="Adjustment">{reading.seasonalAdjustment === "SA" || reading.seasonalAdjustment === "SAAR" ? "Seasonally adjusted" : reading.seasonalAdjustment === "NSA" ? "Not seasonally adjusted" : reading.seasonalAdjustment}</Fact>}
                    <Fact label="Fetched">
                        {reading?.fetchedAt ? (
                            <span className={cn(reading.cached && "inline-flex items-center gap-1 font-medium")}>
                                {reading.cached && <AlertTriangle aria-hidden className="h-3 w-3" />}
                                {formatNewYorkMoment(reading.fetchedAt, now)}
                                {reading.cached && " · saved copy, refreshing"}
                            </span>
                        ) : (
                            "—"
                        )}
                    </Fact>
                    <Fact label="Source">
                        <a href={fredSeriesUrl(def.seriesId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                            FRED series {def.seriesId}
                            <ArrowUpRight aria-hidden className="h-3 w-3" />
                        </a>
                    </Fact>
                </dl>
            </div>
        </Panel>
    );
};

export default IndicatorsBoard;
