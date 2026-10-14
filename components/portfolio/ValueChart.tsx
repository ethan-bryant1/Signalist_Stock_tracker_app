"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ChartLine = { label: string; values: readonly number[]; dashed?: boolean; muted?: boolean };

type Props = {
    title: string;
    days: readonly string[];
    lines: readonly ChartLine[];
    format: (value: number) => string;
    // Shade the area under the first line down to zero (for drawdowns)
    area?: boolean;
    // A vertical marker where the out-of-sample period starts
    splitDay?: string;
    height?: number;
};

const WIDTH = 1000;
const TICKS = 4;

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const formatDay = (day: string) => DAY_LABEL.format(Date.parse(`${day}T00:00:00Z`));

// A plain line chart of daily values (no library: a few thousand points draw as one SVG path). Hover, touch or the
// arrow keys pick a session; the readout above the chart names its values, so nothing depends on color alone.
export default function ValueChart({ title, days, lines, format, area, splitDay, height = 220 }: Props) {
    const [picked, setPicked] = useState<number | undefined>(undefined);
    const last = days.length - 1;
    const index = picked === undefined ? last : Math.min(picked, last);

    const all = lines.flatMap((line) => line.values);
    let low = Math.min(...all, area ? 0 : Infinity);
    let high = Math.max(...all, area ? 0 : -Infinity);
    if (high === low) {
        high += 1;
        low -= 1;
    }
    const pad = (high - low) * 0.06;
    const top = area ? Math.max(high, 0) : high + pad;
    const bottom = low - pad;
    const x = (i: number) => (last > 0 ? (i / last) * WIDTH : 0);
    const y = (value: number) => ((top - value) / (top - bottom)) * height;
    const path = (values: readonly number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
    const ticks = Array.from({ length: TICKS + 1 }, (_, i) => top - ((top - bottom) * i) / TICKS);
    const splitIndex = splitDay ? days.indexOf(splitDay) : -1;

    const pickAt = (clientX: number, element: Element) => {
        const box = element.getBoundingClientRect();
        if (box.width > 0) setPicked(Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * last));
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        const step = event.shiftKey ? 20 : 1;
        const moves: Record<string, number> = { ArrowLeft: index - step, ArrowRight: index + step, Home: 0, End: last };
        if (!(event.key in moves)) return;
        event.preventDefault();
        setPicked(Math.min(last, Math.max(0, moves[event.key])));
    };

    return (
        <figure className="flex flex-col gap-2">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
                <span className="font-semibold text-gray-100">{title}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-gray-400" aria-live="off">
                    <span className="text-gray-500">{days[index] ? formatDay(days[index]) : "—"}</span>
                    {lines.map((line) => (
                        <span key={line.label} className="inline-flex items-center gap-1.5">
                            <svg aria-hidden width="16" height="6" className="shrink-0">
                                <line x1="0" y1="3" x2="16" y2="3" strokeWidth="2" strokeDasharray={line.dashed ? "4 3" : undefined} className={line.muted ? "stroke-gray-500" : "stroke-gray-100"} />
                            </svg>
                            {line.label} <span className="font-medium text-gray-100">{format(line.values[index])}</span>
                        </span>
                    ))}
                </span>
            </figcaption>
            <div className="relative pl-14">
                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12">
                    {ticks.map((tick, i) => (
                        <span key={i} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-gray-500" style={{ top: `${(i / TICKS) * 100}%` }}>
                            {format(tick)}
                        </span>
                    ))}
                </div>
                <div className="relative">
                <svg
                    role="img"
                    aria-label={`${title}. ${lines.map((line) => `${line.label} ${format(line.values[last])} on ${formatDay(days[last])}`).join("; ")}. Use the arrow keys to read other sessions.`}
                    tabIndex={0}
                    viewBox={`0 0 ${WIDTH} ${height}`}
                    preserveAspectRatio="none"
                    className="block w-full cursor-crosshair touch-pan-y overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-100"
                    style={{ height }}
                    onPointerMove={(event) => pickAt(event.clientX, event.currentTarget)}
                    onPointerDown={(event) => pickAt(event.clientX, event.currentTarget)}
                    onPointerLeave={(event) => event.pointerType === "mouse" && setPicked(undefined)}
                    onKeyDown={onKeyDown}
                    onBlur={() => setPicked(undefined)}
                >
                    {ticks.map((tick, i) => (
                        <line key={i} x1="0" x2={WIDTH} y1={y(tick)} y2={y(tick)} className="stroke-gray-600" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    {area && lines[0] && (
                        <path d={`${path(lines[0].values)}L${x(last)},${y(0)}L0,${y(0)}Z`} className="fill-gray-500/25" />
                    )}
                    {splitIndex > 0 && (
                        <line x1={x(splitIndex)} x2={x(splitIndex)} y1="0" y2={height} className="stroke-gray-500" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    )}
                    {[...lines].reverse().map((line) => (
                        <path
                            key={line.label}
                            d={path(line.values)}
                            fill="none"
                            strokeWidth={line.muted ? 1.25 : 1.75}
                            strokeDasharray={line.dashed ? "5 4" : undefined}
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            className={line.muted ? "stroke-gray-500" : "stroke-gray-100"}
                        />
                    ))}
                    <line x1={x(index)} x2={x(index)} y1="0" y2={height} className={cn("stroke-gray-400", picked === undefined && "opacity-0")} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
                {splitIndex > 0 && !area && (
                    <span aria-hidden className="pointer-events-none absolute top-1 pl-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500" style={{ left: `${(splitIndex / last) * 100}%` }}>
                        Out-of-sample
                    </span>
                )}
                </div>
            </div>
            <div aria-hidden className="flex justify-between pl-14 text-[10px] tabular-nums text-gray-500">
                <span>{formatDay(days[0])}</span>
                <span className="hidden sm:inline">{formatDay(days[Math.floor(last / 2)])}</span>
                <span>{formatDay(days[last])}</span>
            </div>
        </figure>
    );
}
