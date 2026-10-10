'use client';

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";

// Briefly tints a price green or red when a refresh moves it, like a trading screen does
const FlashingPrice = ({ value, format = formatCurrency }: { value: number; format?: (value: number) => string }) => {
    const [tracked, setTracked] = useState<{ value: number; direction?: "up" | "down" }>({ value });
    if (tracked.value !== value) setTracked({ value, direction: value > tracked.value ? "up" : "down" });

    return (
        <span
            // A new key restarts the animation on every change
            key={value}
            className={cn(
                "-mx-1 rounded px-1",
                tracked.direction === "up" && "price-flash-up",
                tracked.direction === "down" && "price-flash-down"
            )}
        >
            {format(value)}
        </span>
    );
};

export default FlashingPrice;
