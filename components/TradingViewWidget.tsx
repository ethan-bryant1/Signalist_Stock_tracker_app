'use client';

import React, { memo } from 'react';
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import {cn} from "@/lib/utils";

interface TradingViewWidgetProps {
    title?: string;
    // When set, the title opens this page in a new browser tab (used to open a homepage section on its own page)
    href?: string;
    scriptUrl: string;
    config: Record<string, unknown>;
    height?: number;
    className?: string;
}

const TradingViewWidget = ({ title, href, scriptUrl, config, height = 600, className }: TradingViewWidgetProps) => {
    const containerRef = useTradingViewWidget(scriptUrl, config, height);

    return (
        <div className="w-full">
            {title && (
                <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                    {href ? (
                        <Link href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 hover:text-gray-400 transition-colors">
                            {title}
                            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                    ) : title}
                </h3>
            )}
            <div className={cn('tradingview-widget-container', className)} ref={containerRef}>
                <div className="tradingview-widget-container__widget" style={{ height, width: "100%" }} />
            </div>
        </div>
    );
}

export default memo(TradingViewWidget);
