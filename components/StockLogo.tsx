'use client';

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Company logo on a white tile, or the ticker's first letters when there's no logo or it fails to load
const StockLogo = ({ symbol, logo }: { symbol: string; logo?: string }) => {
    const [failed, setFailed] = useState(false);
    const showLogo = !!logo?.startsWith("https://") && !failed;

    return (
        <span
            className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl",
                showLogo ? "bg-white p-2" : "bg-gray-700 text-lg font-semibold text-gray-100"
            )}
        >
            {showLogo ? (
                // Logos come from Finnhub in different formats, so show them as they are
                <Image src={logo!} alt="" width={40} height={40} unoptimized onError={() => setFailed(true)} className="h-full w-full object-contain" />
            ) : (
                symbol.slice(0, 2)
            )}
        </span>
    );
};

export default StockLogo;
