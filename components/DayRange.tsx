import { cn, formatCurrency } from "@/lib/utils";

// Where today's price sits between the day's low and high
const DayRange = ({ low, high, price, currency, className }: { low: number; high: number; price: number; currency?: string; className?: string }) => {
    const position = high > low ? Math.min(Math.max((price - low) / (high - low), 0), 1) : 0.5;

    return (
        <div className={cn("mt-4", className)} title={`Day range ${formatCurrency(low, currency)} – ${formatCurrency(high, currency)}`}>
            <div className="relative h-1 rounded-full bg-gray-700">
                <span
                    aria-hidden
                    className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-100"
                    style={{ left: `${position * 100}%` }}
                />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-gray-500">
                <span><span className="sr-only">Day low </span>{formatCurrency(low, currency)}</span>
                <span><span className="sr-only">Day high </span>{formatCurrency(high, currency)}</span>
            </div>
        </div>
    );
};

export default DayRange;
