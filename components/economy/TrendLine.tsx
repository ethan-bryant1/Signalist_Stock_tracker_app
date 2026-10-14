import { memo } from "react";
import type { Observation } from "@/lib/indicators";
import { cn } from "@/lib/utils";

// A small line of an indicator's recent values, drawn in the text color (no gain/loss colors: a rising
// unemployment rate isn't "green"). A dashed line marks zero when the values cross it. Decorative: the table
// beside it carries the numbers.
const TrendLine = ({ points, className }: { points: readonly Observation[]; className?: string }) => {
    if (points.length < 2) return <span aria-hidden className={cn("block", className)} />;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const y = (value: number) => 22 - ((value - min) / span) * 20;
    const path = points.map((point, index) => `${index ? "L" : "M"}${((index / (points.length - 1)) * 100).toFixed(2)},${y(point.value).toFixed(2)}`).join("");
    return (
        <svg aria-hidden viewBox="0 0 100 24" preserveAspectRatio="none" className={cn("block overflow-visible", className)}>
            {min < 0 && max > 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="stroke-gray-600" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
            <path d={path} fill="none" className="stroke-gray-400" strokeWidth="1.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};

export default memo(TrendLine);
