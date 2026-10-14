'use client';

import { useState } from "react";
import { formatIndicatorValue, formatPeriod, type Frequency, type Observation, type ValueUnit } from "@/lib/indicators";

const W = 600;
const H = 200;
const PAD = 8;

// The selected indicator's fetched history as a line. Pointer or arrow keys move a marker that reads out one
// observation exactly as FRED published it. Monochrome: an economic series moving up isn't a gain.
// The parent keys it by indicator, so the marker resets when the indicator changes.
const IndicatorChart = ({ points, unit, frequency, label }: { points: readonly Observation[]; unit: ValueUnit; frequency: Frequency; label: string }) => {
    const [cursor, setCursor] = useState<number | null>(null);

    if (points.length < 2) {
        return <p className="flex h-48 items-center justify-center text-sm text-gray-500">Not enough history to draw.</p>;
    }

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) || 1;
    const x = (index: number) => (index / (points.length - 1)) * W;
    const y = (value: number) => PAD + (1 - (value - min) / span) * (H - 2 * PAD);
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
    const first = points[0];
    const last = points[points.length - 1];
    const shown = cursor !== null ? points[cursor] : last;
    const move = (index: number) => setCursor(Math.max(0, Math.min(points.length - 1, index)));

    const summary = `${label}: ${points.length} values from ${formatPeriod(first.date, frequency)} to ${formatPeriod(last.date, frequency)}, low ${formatIndicatorValue(min, unit)}, high ${formatIndicatorValue(max, unit)}. Use the arrow keys to read each value.`;

    return (
        <figure className="flex flex-col gap-2">
            <figcaption className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
                <span className="text-gray-500">{formatPeriod(shown.date, frequency)}</span>
                <span aria-live="polite" className="font-semibold text-gray-100">
                    {formatIndicatorValue(shown.value, unit)}
                </span>
            </figcaption>
            {/* The right gutter holds the high and low labels, clear of the line */}
            <div className="relative pr-14">
                <svg
                    role="img"
                    aria-label={summary}
                    tabIndex={0}
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    className="block h-48 w-full touch-none overflow-visible rounded-md outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                    onPointerMove={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        move(Math.round(((event.clientX - box.left) / box.width) * (points.length - 1)));
                    }}
                    onPointerLeave={() => setCursor(null)}
                    onKeyDown={(event) => {
                        const at = cursor ?? points.length - 1;
                        const step = { ArrowLeft: -1, ArrowRight: 1, Home: -points.length, End: points.length } as Record<string, number>;
                        if (!(event.key in step)) return;
                        event.preventDefault();
                        move(at + step[event.key]);
                    }}
                    onBlur={() => setCursor(null)}
                >
                    <line x1="0" x2={W} y1={y(max)} y2={y(max)} className="stroke-gray-700" vectorEffect="non-scaling-stroke" />
                    <line x1="0" x2={W} y1={y(min)} y2={y(min)} className="stroke-gray-700" vectorEffect="non-scaling-stroke" />
                    {min < 0 && max > 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="stroke-gray-500" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
                    <path d={path} fill="none" className="stroke-gray-100" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1="0" y2={H} className="stroke-gray-500" vectorEffect="non-scaling-stroke" />}
                </svg>
                {cursor !== null && (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-100"
                        style={{ left: `calc((100% - 3.5rem) * ${x(cursor) / W})`, top: `${(y(points[cursor].value) / H) * 100}%` }}
                    />
                )}
                <span aria-hidden className="pointer-events-none absolute right-0 w-12 -translate-y-1/2 text-right text-[10px] tabular-nums text-gray-500" style={{ top: `${(y(max) / H) * 100}%` }}>
                    {formatIndicatorValue(max, unit)}
                </span>
                <span aria-hidden className="pointer-events-none absolute right-0 w-12 -translate-y-1/2 text-right text-[10px] tabular-nums text-gray-500" style={{ top: `${(y(min) / H) * 100}%` }}>
                    {formatIndicatorValue(min, unit)}
                </span>
            </div>
            <div aria-hidden className="mt-1 flex justify-between pr-14 text-[10px] tabular-nums text-gray-500">
                <span>{formatPeriod(first.date, frequency)}</span>
                <span>{formatPeriod(last.date, frequency)}</span>
            </div>
        </figure>
    );
};

export default IndicatorChart;
