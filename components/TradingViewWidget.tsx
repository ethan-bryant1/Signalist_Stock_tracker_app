'use client';

import React, { memo } from 'react';
import useTradingViewWidget, { TRADINGVIEW_ATTRIBUTION_HEIGHT } from "@/hooks/useTradingViewWidget";
import {cn} from "@/lib/utils";

interface TradingViewWidgetProps {
    title?: string;
    scriptUrl: string;
    config: Record<string, unknown>;
    height?: number;
    className?: string;
}

// Shown in place of a widget whose script didn't load (offline, blocked by an ad blocker, or TradingView down)
export const WidgetFailed = ({ name, onRetry, className }: { name: string; onRetry: () => void; className?: string }) => (
    <div role="alert" className={cn("absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-800 px-6 text-center", className)}>
        <p className="text-sm text-gray-400">TradingView&apos;s {name} didn&apos;t load. An ad blocker or a lost connection can stop it.</p>
        <button
            type="button"
            onClick={onRetry}
            className="h-8 cursor-pointer rounded-md border border-gray-600 px-3 text-xs font-semibold text-gray-100 transition-colors hover:border-gray-500"
        >
            Try again
        </button>
    </div>
);

const TradingViewWidget = ({ title, scriptUrl, config, height = 600, className }: TradingViewWidgetProps) => {
    const { containerRef, status, retry } = useTradingViewWidget(scriptUrl, config, height);

    return (
        <div className="w-full">
            {title && <h3 className="font-semibold text-2xl text-gray-100 mb-5">{title}</h3>}
            {/* At least the widget's height plus its attribution, so a failure message has room before the widget loads */}
            <div className="relative" style={{ minHeight: height + TRADINGVIEW_ATTRIBUTION_HEIGHT }}>
                {/* Left empty: the hook writes the widget and its attribution into it */}
                <div className={cn('tradingview-widget-container', className)} ref={containerRef} />
                {status === 'failed' && <WidgetFailed name="widget" onRetry={retry} />}
            </div>
        </div>
    );
}

export default memo(TradingViewWidget);
