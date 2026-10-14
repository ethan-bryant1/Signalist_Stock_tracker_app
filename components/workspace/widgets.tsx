'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import DashboardHeatmap from "@/components/DashboardHeatmap";
import IndexTiles from "@/components/IndexTiles";
import { useLiveMarket } from "@/components/LiveMarket";
import PriceStamp from "@/components/PriceStamp";
import SectorPerformance from "@/components/SectorPerformance";
import TradingViewWidget from "@/components/TradingViewWidget";
import { useNow } from "@/hooks/useHeatmapFeed";
import { getCompanyNewsForWidget, getStockQuote, type StockQuote } from "@/lib/actions/finnhub.actions";
import { getWatchlistSymbols } from "@/lib/actions/watchlist.actions";
import { getIndicatorsForWidget } from "@/lib/actions/indicator.actions";
import FredKeyNotice from "@/components/economy/FredKeyNotice";
import { ChangeText } from "@/components/economy/IndicatorsBoard";
import { FRED_NOTICE, INDICATORS, formatIndicatorValue, formatPeriod, type IndicatorsPayload } from "@/lib/indicators";
import WatchlistGrid from "@/components/watchlist/WatchlistGrid";
import NewsList from "@/components/news/NewsList";
import { headlineStatus, type CompanyNewsResult } from "@/lib/news";
import { useMarketNews } from "@/hooks/useMarketNews";
import { useWatchRows } from "@/components/watchlist/useWatchRows";
import type { ColumnKey } from "@/lib/watchlists";
import {
    COMPANY_FINANCIALS_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    ECONOMIC_CALENDAR_WIDGET_CONFIG,
    MARKET_DATA_PAGE_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG,
    TRADINGVIEW_SCRIPT_URL,
} from "@/lib/constants";
import type { HeatmapPayload } from "@/lib/market-data";
import { cn, formatChangePercent, formatCurrency, formatSignedNumber, getChangeColorClass } from "@/lib/utils";
import type { WidgetType } from "@/lib/workspace";

export type WidgetProps = {
    symbol: string;
    // Loads a symbol into the workspace's linked widgets
    onPickSymbol: (symbol: string) => void;
};

// ---------- Shared lookups ----------

// One request per symbol for every widget on the page that needs its quote or exchange, kept a minute. The server's
// cache answers repeats without asking Finnhub again.
const QUOTE_KEEP_MS = 60_000;
const quoteRequests = new Map<string, { at: number; promise: Promise<StockQuote> }>();
const loadQuote = (symbol: string) => {
    const held = quoteRequests.get(symbol);
    if (held && Date.now() - held.at < QUOTE_KEEP_MS) return held.promise;
    const promise = getStockQuote(symbol).catch((): StockQuote => ({ symbol, kind: "other", tradingViewSymbol: symbol, currency: "USD", issue: "network" }));
    quoteRequests.set(symbol, { at: Date.now(), promise });
    return promise;
};

// The quote for a symbol, or undefined while it loads (or when it belongs to a symbol shown before)
const useQuote = (symbol: string) => {
    const [result, setResult] = useState<{ symbol: string; quote: StockQuote } | null>(null);
    useEffect(() => {
        let current = true;
        loadQuote(symbol).then((quote) => current && setResult({ symbol, quote }));
        return () => {
            current = false;
        };
    }, [symbol]);
    return result?.symbol === symbol ? result.quote : undefined;
};

const Message = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-gray-500">{children}</p>;

const Loading = ({ rows = 3 }: { rows?: number }) => (
    <div aria-label="Loading" className="flex flex-col divide-y divide-gray-600">
        {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="h-14 animate-pulse bg-gray-700/30 motion-reduce:animate-none" />
        ))}
    </div>
);

// ---------- TradingView ----------

const TradingViewFill = ({ script, config }: { script: string; config: Record<string, unknown> }) => (
    <TradingViewWidget scriptUrl={`${TRADINGVIEW_SCRIPT_URL}${script}`} config={config} height="fill" className="rounded-none!" />
);

// TradingView's own chart in the widget: its timeframes, indicators and drawing tools; its data may be delayed
const ChartWidget = ({ symbol }: WidgetProps) => {
    const config = useMemo(
        () => ({
            allow_symbol_change: false,
            autosize: true,
            calendar: false,
            details: false,
            hide_side_toolbar: false,
            hide_top_toolbar: false,
            hide_legend: false,
            hide_volume: false,
            hotlist: false,
            interval: "D",
            locale: "en",
            save_image: false,
            style: 1,
            symbol,
            theme: "dark",
            timezone: "America/New_York",
            backgroundColor: "#141414",
            gridColor: "#141414",
            withdateranges: true,
        }),
        [symbol]
    );
    return <TradingViewFill key={symbol} script="advanced-chart.js" config={config} />;
};

// Widgets that need the exchange (NASDAQ:AAPL) wait for the quote lookup, which has it
const useTradingViewSymbol = (symbol: string) => useQuote(symbol)?.tradingViewSymbol;

const fill = { width: "100%", height: "100%" };

const TechnicalsWidget = ({ symbol }: WidgetProps) => {
    const tvSymbol = useTradingViewSymbol(symbol);
    const config = useMemo(() => (tvSymbol ? { ...TECHNICAL_ANALYSIS_WIDGET_CONFIG(tvSymbol), ...fill } : undefined), [tvSymbol]);
    return config ? <TradingViewFill key={tvSymbol} script="technical-analysis.js" config={config} /> : <Loading />;
};

const ProfileWidget = ({ symbol }: WidgetProps) => {
    const tvSymbol = useTradingViewSymbol(symbol);
    const config = useMemo(() => (tvSymbol ? { ...COMPANY_PROFILE_WIDGET_CONFIG(tvSymbol), ...fill } : undefined), [tvSymbol]);
    if (!tvSymbol) return <Loading />;
    if (!tvSymbol.includes(":")) return <Message>No profile: the exchange for {symbol} isn&apos;t known, which TradingView&apos;s profile needs.</Message>;
    return <TradingViewFill key={tvSymbol} script="symbol-profile.js" config={config!} />;
};

const FinancialsWidget = ({ symbol }: WidgetProps) => {
    const quote = useQuote(symbol);
    const tvSymbol = quote?.tradingViewSymbol;
    const config = useMemo(() => (tvSymbol ? { ...COMPANY_FINANCIALS_WIDGET_CONFIG(tvSymbol), ...fill } : undefined), [tvSymbol]);
    if (!quote) return <Loading />;
    if (quote.kind === "fund") return <Message>{symbol} is a fund, so it has no income statement or balance sheet.</Message>;
    if (!tvSymbol?.includes(":")) return <Message>No financials: the exchange for {symbol} isn&apos;t known, which TradingView&apos;s financials need.</Message>;
    return <TradingViewFill key={tvSymbol} script="financials.js" config={config!} />;
};

// ---------- Finnhub ----------

// The symbol's latest price from the shared cache, with its time and source. Loaded once per symbol: no polling.
const QuoteWidget = ({ symbol }: WidgetProps) => {
    const quote = useQuote(symbol);
    const [renderedAt] = useState(() => Date.now());
    if (!quote) return <Loading rows={2} />;
    const { name, price, change, changePercent, previousClose, dayLow, dayHigh, quoteTime, cached, issue, currency } = quote;
    const money = (value?: number) => (value !== undefined ? formatCurrency(value, currency) : "—");
    return (
        <div className="flex h-full flex-col gap-3 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-400">{name ?? symbol}</p>
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-100">{price !== undefined ? money(price) : "—"}</p>
                    {change !== undefined && changePercent !== undefined && (
                        <p className={cn("text-sm font-medium tabular-nums", getChangeColorClass(changePercent))}>
                            {formatSignedNumber(change)} ({formatChangePercent(changePercent)})
                        </p>
                    )}
                </div>
                <Link href={`/stocks/${encodeURIComponent(symbol)}`} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100">
                    Page
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
                <dt className="text-gray-500">Previous close</dt>
                <dd className="text-right text-gray-100">{money(previousClose)}</dd>
                <dt className="text-gray-500">Day range</dt>
                <dd className="text-right text-gray-100">{dayLow !== undefined && dayHigh !== undefined ? `${money(dayLow)} – ${money(dayHigh)}` : "—"}</dd>
            </dl>
            <PriceStamp hasPrice={price !== undefined} quoteTime={quoteTime} cached={cached} issue={issue} renderedAt={renderedAt} className="mt-auto" />
        </div>
    );
};

const NewsWidget = ({ symbol }: WidgetProps) => {
    const now = useNow(useLiveMarket().checkedAt);
    const [result, setResult] = useState<{ symbol: string; news: CompanyNewsResult | null } | null>(null);
    useEffect(() => {
        let current = true;
        getCompanyNewsForWidget(symbol)
            .catch(() => null)
            .then((news) => current && setResult({ symbol, news }));
        return () => {
            current = false;
        };
    }, [symbol]);
    const items = result?.news?.items ?? [];
    if (result?.symbol !== symbol) return <Loading />;
    if (result.news === null || (items.length === 0 && result.news.issue)) return <Message>News couldn&apos;t load right now.</Message>;
    if (items.length === 0) return <Message>No news about {symbol} in the past week.</Message>;
    return <NewsList items={items} now={now} density="compact" grouped={false} label={`${symbol} news`} />;
};

// Finnhub's market and M&A headlines from the News page's shared feed (reused for 10 minutes on the server)
const MarketNewsWidget = () => {
    const now = useNow(useLiveMarket().checkedAt);
    const { result, failed } = useMarketNews(null);
    if (result === null) return failed ? <Message>Headlines couldn&apos;t load right now.</Message> : <Loading />;
    if (result.items.length === 0 && (result.issue || failed)) return <Message>Headlines couldn&apos;t load right now.</Message>;
    if (result.items.length === 0) return <Message>Finnhub sent no headlines.</Message>;
    const status = headlineStatus(result, now, failed);
    return (
        <>
            {status.warning && <p className="border-b border-gray-600 px-4 py-1.5 text-[11px] font-medium text-gray-100">{status.text}</p>}
            <NewsList items={result.items} now={now} density="compact" showFeed grouped={false} label="Market news" />
        </>
    );
};

const WIDGET_COLUMNS: ColumnKey[] = ["last", "changePercent"];
const LIST_ORDER = { key: "manual", dir: "asc" } as const;

// The open watchlist in the Watchlist page's own grid, cut down to price and day's change. Its figures come in one
// request from the shared cache, loaded once. Picking a row loads the stock into every linked widget.
const WatchlistWidget = ({ symbol, onPickSymbol }: WidgetProps) => {
    const [items, setItems] = useState<{ symbol: string; company: string }[] | null | "failed">(null);
    useEffect(() => {
        let current = true;
        getWatchlistSymbols()
            .then((list) => current && setItems(list))
            .catch(() => current && setItems("failed"));
        return () => {
            current = false;
        };
    }, []);
    const symbols = useMemo(() => (Array.isArray(items) ? items.map((item) => item.symbol) : []), [items]);
    const { rows } = useWatchRows(symbols, []);
    const gridRows = useMemo(() => (Array.isArray(items) ? items.map((item) => ({ ...item, data: rows[item.symbol] })) : []), [items, rows]);
    if (items === null) return <Loading />;
    if (items === "failed") return <Message>Your watchlist couldn&apos;t load right now.</Message>;
    if (items.length === 0) return <Message>Your open watchlist is empty. Add stocks on the Watchlist page or with the star in search.</Message>;
    return <WatchlistGrid rows={gridRows} columns={WIDGET_COLUMNS} sort={LIST_ORDER} density="compact" selected={symbol} onSelect={onPickSymbol} label="Watchlist" linkSymbols={false} maxHeightClass="max-h-full" />;
};

// The dashboard's Market Snapshot; a click loads a stock into the linked widgets. Its prices come from the same
// cache and refresh as the dashboard's, so it adds no requests when both are open.
const SnapshotWidget = ({ symbol, onPickSymbol }: WidgetProps) => {
    const [payload, setPayload] = useState<HeatmapPayload | null | "failed">(null);
    useEffect(() => {
        let current = true;
        fetch("/api/heatmap")
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((data: HeatmapPayload) => current && setPayload(data))
            .catch(() => current && setPayload("failed"));
        return () => {
            current = false;
        };
    }, []);
    if (payload === null) return <div aria-label="Loading" className="h-full animate-pulse bg-gray-700/30 motion-reduce:animate-none" />;
    if (payload === "failed") return <Message>The Market Snapshot couldn&apos;t load. Reload the page to try again.</Message>;
    return <DashboardHeatmap initial={payload} className="h-full" selectedSymbol={symbol} onSelect={onPickSymbol} />;
};

const SectorsWidget = () => {
    const now = useNow(useLiveMarket().checkedAt);
    return <SectorPerformance now={now} framed={false} className="min-h-full" />;
};

const IndexesWidget = () => (
    <div className="p-3">
        <IndexTiles />
    </div>
);

// The Economy page's indicators as a compact list: latest figure, its period and the change from the period before.
// Loaded once from the server's FRED cache (shared with the Economy page): no polling, no Finnhub calls.
const IndicatorsWidget = () => {
    const [payload, setPayload] = useState<IndicatorsPayload | null | "failed">(null);
    useEffect(() => {
        let current = true;
        getIndicatorsForWidget()
            .then((data) => current && setPayload(data ?? "failed"))
            .catch(() => current && setPayload("failed"));
        return () => {
            current = false;
        };
    }, []);
    if (payload === null) return <Loading rows={6} />;
    if (payload === "failed") return <Message>Economic indicators couldn&apos;t load right now.</Message>;
    if (!payload.configured) return <FredKeyNotice compact />;
    const byId = new Map(payload.readings.map((reading) => [reading.id, reading]));
    return (
        <div className="flex min-h-full flex-col">
            <ul className="divide-y divide-gray-600">
                {INDICATORS.map((def) => {
                    const reading = byId.get(def.id);
                    return (
                        <li key={def.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                            <span className="min-w-0">
                                <span className="block truncate font-medium text-gray-100">{def.label}</span>
                                <span className="block truncate text-[11px] text-gray-500">{reading?.latest ? formatPeriod(reading.latest.date, def.frequency) : "No figure"}</span>
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="block font-semibold tabular-nums text-gray-100">{formatIndicatorValue(reading?.latest?.value, def.unit)}</span>
                                <ChangeText change={reading?.change} unit={def.unit} className="text-[11px] text-gray-500" />
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-auto flex flex-col gap-1 border-t border-gray-600 px-4 py-2 text-[11px] text-gray-500">
                <Link href="/economy" className="inline-flex items-center gap-1 font-medium text-gray-400 hover:text-gray-100">
                    Economy page
                    <ArrowUpRight aria-hidden className="h-3 w-3" />
                </Link>
                <span>{FRED_NOTICE}</span>
            </div>
        </div>
    );
};

// ---------- Catalog ----------

export const WIDGET_CONTENT: Record<WidgetType, { component: React.ComponentType<WidgetProps>; scroll: boolean }> = {
    chart: { component: ChartWidget, scroll: false },
    quote: { component: QuoteWidget, scroll: true },
    news: { component: NewsWidget, scroll: true },
    marketNews: { component: MarketNewsWidget, scroll: true },
    technicals: { component: TechnicalsWidget, scroll: false },
    profile: { component: ProfileWidget, scroll: false },
    financials: { component: FinancialsWidget, scroll: false },
    watchlist: { component: WatchlistWidget, scroll: true },
    snapshot: { component: SnapshotWidget, scroll: false },
    sectors: { component: SectorsWidget, scroll: true },
    indexes: { component: IndexesWidget, scroll: true },
    headlines: { component: () => <TradingViewFill script="timeline.js" config={{ ...TOP_STORIES_WIDGET_CONFIG, ...fill }} />, scroll: false },
    calendar: { component: () => <TradingViewFill script="events.js" config={{ ...ECONOMIC_CALENDAR_WIDGET_CONFIG, ...fill }} />, scroll: false },
    screener: { component: () => <TradingViewFill script="screener.js" config={{ ...MARKET_DATA_PAGE_WIDGET_CONFIG, ...fill }} />, scroll: false },
    overview: { component: () => <TradingViewFill script="market-overview.js" config={{ ...MARKET_OVERVIEW_WIDGET_CONFIG, ...fill }} />, scroll: false },
    indicators: { component: IndicatorsWidget, scroll: true },
};
