'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import {
    CandlestickSeries,
    ColorType,
    createChart,
    HistogramSeries,
    LineSeries,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type SeriesType,
} from "lightweight-charts";
import { ToolButton } from "@/components/ToolButton";
import useTheme from "@/hooks/useTheme";
import { formatNewYorkDay, formatNewYorkTime } from "@/lib/market-data";
import { ISSUE_WORDS } from "@/lib/price-stamp";
import {
    BOLLINGER,
    bollingerBands,
    CHART_RANGES,
    dayChangePercent,
    MOVING_AVERAGES,
    rangeStartIndex,
    relativeStrengthIndex,
    RSI_LENGTH,
    RSI_LEVELS,
    simpleMovingAverage,
    type Bands,
    type ChartIndicator,
    type ChartPayload,
    type ChartSettings,
} from "@/lib/price-chart";
import type { Theme } from "@/lib/theme";
import { formatChangePercent, getChangeColorClass } from "@/lib/utils";

// The stock page's own daily chart: Alpaca's adjusted daily bars (the Portfolio page's cached copy) drawn with
// TradingView's open-source Lightweight Charts library. Candles or a close line, volume, 50- and 200-session simple
// moving averages, optional Bollinger Bands (20, 2) and a 14-session RSI pane, and ranges from 3 months to the whole history since 2016. Loads once per symbol when opened (the
// server asks Alpaca at most once a day per symbol); no polling, since a daily bar only changes after the session.

type Props = {
    symbol: string;
    settings: ChartSettings;
    onChange: (change: Partial<ChartSettings>) => void;
};

type Loaded = { symbol: string; attempt: number; payload?: ChartPayload; signedOut?: boolean };

// Answers kept for this visit, so switching sources or symbols back and forth asks the server once
const answers = new Map<string, ChartPayload>();

const PRICE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VOLUME = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatDay = (day: string) => DAY.format(Date.parse(`${day}T00:00:00Z`));
const price = (value: number | undefined) => (value === undefined ? "—" : PRICE.format(value));

// Up and down candles use the app's gain and loss colors (green 800 / red 700 in light, green 500 / red 500 in dark);
// everything else is the theme's gray scale, read from the page so the chart matches both themes.
// The library only reads hex and rgb colors, while the theme's grays can be lab() or oklch(), so each is painted on a
// one-pixel canvas and read back as rgb.
const toRgb = (color: string, fallback: string) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!color || !context) return fallback;
    context.fillStyle = fallback;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
};

const readColors = (theme: Theme) => {
    const css = getComputedStyle(document.documentElement);
    const gray = (step: number) => toRgb(css.getPropertyValue(`--color-gray-${step}`).trim(), theme === "dark" ? "#9095A1" : "#52525B");
    return {
        text: gray(500),
        grid: gray(700),
        border: gray(600),
        strong: gray(100),
        muted: gray(500),
        volume: theme === "dark" ? "rgba(144, 149, 161, 0.4)" : "rgba(82, 82, 91, 0.3)",
        up: theme === "dark" ? "#22C55E" : "#166534",
        down: theme === "dark" ? "#FF495B" : "#B91C1C",
        font: getComputedStyle(document.body).fontFamily,
    };
};

// The 50-session average is a solid gray line, the 200-session one dashed, so they differ without color
const averageStyle = (length: number) => (length === 50 ? { dashed: false } : { dashed: true });

const INDICATOR_BUTTONS: { id: ChartIndicator; label: string; title: string }[] = [
    { id: "bollinger", label: "BB", title: `Bollinger Bands: ${BOLLINGER.length}-session average of the close ± ${BOLLINGER.width} standard deviations` },
    { id: "rsi", label: "RSI", title: `${RSI_LENGTH}-session Relative Strength Index (Wilder), in its own pane` },
];

const oneDecimal = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(1));

export default function PriceChart({ symbol, settings, onChange }: Props) {
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<{ chart: IChartApi; main: ISeriesApi<SeriesType> } | undefined>(undefined);
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
    const [picked, setPicked] = useState<number | undefined>(undefined);

    const cachedAnswer = answers.get(symbol);
    const current = loaded?.symbol === symbol && loaded.attempt === attempt ? loaded : undefined;
    const payload = cachedAnswer ?? current?.payload;
    const bars = payload?.status === "ok" ? payload.bars : undefined;
    const { range, style, averages, indicators } = settings;
    const averagesKey = averages.join(",");
    const showBands = indicators.includes("bollinger");
    const showRsi = indicators.includes("rsi");

    useEffect(() => {
        if (answers.has(symbol)) return;
        const controller = new AbortController();
        fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
            .then(async (res) => {
                if (res.status === 401) return setLoaded({ symbol, attempt, signedOut: true });
                if (!res.ok) throw new Error(String(res.status));
                const answer = (await res.json()) as ChartPayload;
                if (answer.status === "ok" || answer.status === "no-bars") answers.set(symbol, answer);
                setLoaded({ symbol, attempt, payload: answer });
            })
            .catch(() => {
                if (!controller.signal.aborted) setLoaded({ symbol, attempt, payload: { status: "failed", issue: "network" } });
            });
        return () => controller.abort();
    }, [symbol, attempt]);

    const lines = useMemo(
        () => (bars ? MOVING_AVERAGES.map((length) => ({ length, values: simpleMovingAverage(bars.close, length) })) : []),
        [bars]
    );
    // Computed from the loaded closes only when shown; no extra requests
    const bands = useMemo(() => (bars && showBands ? bollingerBands(bars.close) : undefined), [bars, showBands]);
    const rsi = useMemo(() => (bars && showRsi ? relativeStrengthIndex(bars.close) : undefined), [bars, showRsi]);

    // Draws the chart; rebuilt when the bars, style, averages or theme change (cheap for a few thousand bars)
    useEffect(() => {
        const element = containerRef.current;
        if (!element || !bars) return;
        const colors = readColors(theme);
        const chart = createChart(element, {
            autoSize: true,
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: colors.text,
                fontFamily: colors.font,
                fontSize: 11,
                // The library's licence asks for this link to TradingView
                attributionLogo: true,
                panes: { separatorColor: colors.border, separatorHoverColor: colors.grid },
            },
            grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
            rightPriceScale: { borderColor: colors.border },
            timeScale: { borderColor: colors.border, rightOffset: 3, minBarSpacing: 0.1 },
            crosshair: {
                vertLine: { color: colors.muted, labelBackgroundColor: colors.strong },
                horzLine: { color: colors.muted, labelBackgroundColor: colors.strong },
            },
            // A vertical swipe scrolls the page on phones instead of moving the chart
            handleScroll: { vertTouchDrag: false },
        });

        const main: ISeriesApi<SeriesType> =
            style === "candles"
                ? chart.addSeries(CandlestickSeries, {
                      upColor: colors.up,
                      downColor: colors.down,
                      wickUpColor: colors.up,
                      wickDownColor: colors.down,
                      borderVisible: false,
                      priceLineColor: colors.muted,
                  })
                : chart.addSeries(LineSeries, { color: colors.strong, lineWidth: 2, priceLineColor: colors.muted });
        if (style === "candles") {
            main.setData(bars.days.map((time, i) => ({ time, open: bars.open[i], high: bars.high[i], low: bars.low[i], close: bars.close[i] })));
        } else {
            main.setData(bars.days.map((time, i) => ({ time, value: bars.close[i] })));
        }

        for (const line of lines) {
            if (!averagesKey.split(",").includes(String(line.length))) continue;
            const series = chart.addSeries(LineSeries, {
                color: line.length === 50 ? colors.strong : colors.muted,
                lineWidth: 1,
                lineStyle: averageStyle(line.length).dashed ? LineStyle.Dashed : LineStyle.Solid,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
            });
            // Sessions before the average has enough closes stay empty, keeping every series on the same days
            series.setData(bars.days.map((time, i) => (line.values[i] === undefined ? { time } : { time, value: line.values[i]! })));
        }

        if (bands) {
            // Dotted gray bands with a sparser dotted middle, distinct from the solid and dashed moving averages
            const band = (pick: (b: Bands) => number, lineStyle: LineStyle) => {
                const series = chart.addSeries(LineSeries, {
                    color: colors.muted,
                    lineWidth: 1,
                    lineStyle,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                });
                series.setData(bars.days.map((time, i) => (bands[i] === undefined ? { time } : { time, value: pick(bands[i]!) })));
            };
            band((b) => b.upper, LineStyle.Dotted);
            band((b) => b.middle, LineStyle.SparseDotted);
            band((b) => b.lower, LineStyle.Dotted);
        }

        const volume = chart.addSeries(
            HistogramSeries,
            { color: colors.volume, priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
            1
        );
        volume.setData(bars.days.map((time, i) => ({ time, value: bars.volume[i] })));
        if (rsi) {
            const series = chart.addSeries(
                LineSeries,
                {
                    color: colors.strong,
                    lineWidth: 1,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                    // The scale always spans 0 to 100, so the dashed 70 and 30 lines stay put
                    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
                },
                2
            );
            series.setData(bars.days.map((time, i) => (rsi[i] === undefined ? { time } : { time, value: rsi[i]! })));
            for (const level of RSI_LEVELS) {
                series.createPriceLine({ price: level, color: colors.muted, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
            }
        }
        const panes = chart.panes();
        panes[0]?.setStretchFactor(rsi ? 4 : 3);
        panes[1]?.setStretchFactor(1);
        panes[2]?.setStretchFactor(1.25);

        const last = bars.days.length - 1;
        // Every series starts on the first bar, so the crosshair's logical position is the bar's index
        chart.subscribeCrosshairMove((param) => {
            setPicked(param.logical === undefined ? undefined : Math.min(last, Math.max(0, Math.round(param.logical))));
        });
        chartRef.current = { chart, main };
        return () => {
            chartRef.current = undefined;
            chart.remove();
        };
    }, [bars, lines, bands, rsi, style, averagesKey, theme]);

    // Shows the chosen range, ending on the newest bar; runs after every rebuild too
    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart || !bars) return;
        const last = bars.days.length - 1;
        chart.timeScale().setVisibleLogicalRange({ from: rangeStartIndex(bars.days, range) - 0.5, to: last + 3 });
    }, [bars, range, style, averagesKey, bands, rsi, theme]);

    if (!payload && !current?.signedOut) {
        return (
            <p role="status" className="flex h-full items-center justify-center p-6 text-sm text-gray-500">
                Loading {symbol} daily prices…
            </p>
        );
    }

    if (current?.signedOut || !payload || payload.status !== "ok" || !bars) {
        const message = current?.signedOut
            ? "Your session has ended. Sign in again to load the chart."
            : payload?.status === "not-configured"
              ? "The daily chart needs the free Alpaca keys (ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY) on the server. The TradingView chart works without them."
              : payload?.status === "no-bars"
                ? `Alpaca has no daily prices for ${symbol}. It covers US-listed stocks and funds.`
                : `Daily prices couldn't load: ${ISSUE_WORDS[payload?.status === "failed" ? payload.issue : "network"]}. Nothing is filled in.`;
        return (
            <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-400">
                <p className="max-w-md">{message}</p>
                {payload?.status === "failed" && (
                    <ToolButton title="Ask for the daily prices again" onClick={() => setAttempt((n) => n + 1)}>
                        <RotateCw aria-hidden className="h-3.5 w-3.5" /> Try again
                    </ToolButton>
                )}
            </div>
        );
    }

    const last = bars.days.length - 1;
    const index = picked === undefined ? last : Math.min(picked, last);
    const change = dayChangePercent(bars.close, index);
    const shownAverages = lines.filter((line) => averages.includes(line.length));
    const throughDay = formatDay(bars.days[last]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        const step = event.shiftKey ? 20 : 1;
        const moves: Record<string, number> = { ArrowLeft: index - step, ArrowRight: index + step, Home: 0, End: last };
        if (event.key === "Escape") {
            chartRef.current?.chart.clearCrosshairPosition();
            setPicked(undefined);
            return;
        }
        if (!(event.key in moves)) return;
        event.preventDefault();
        const next = Math.min(last, Math.max(0, moves[event.key]));
        setPicked(next);
        const drawn = chartRef.current;
        if (drawn) drawn.chart.setCrosshairPosition(bars.close[next], bars.days[next], drawn.main);
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-600 px-3 py-2">
                <div role="group" aria-label="Range" className="flex flex-wrap gap-1">
                    {CHART_RANGES.map((item) => (
                        <ToolButton key={item.id} title={`Show ${item.label === "Max" ? "all history since 2016" : item.label}`} pressed={range === item.id} onClick={() => onChange({ range: item.id })} className="h-7 px-2">
                            {item.label}
                        </ToolButton>
                    ))}
                </div>
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-gray-600 sm:block" />
                <div role="group" aria-label="Chart style" className="flex gap-1">
                    <ToolButton title="Candles" pressed={style === "candles"} onClick={() => onChange({ style: "candles" })} className="h-7 px-2">
                        Candles
                    </ToolButton>
                    <ToolButton title="Close line" pressed={style === "line"} onClick={() => onChange({ style: "line" })} className="h-7 px-2">
                        Line
                    </ToolButton>
                </div>
                <div role="group" aria-label="Moving averages" className="flex gap-1">
                    {MOVING_AVERAGES.map((length) => (
                        <ToolButton
                            key={length}
                            title={`${length}-session simple moving average of the close`}
                            pressed={averages.includes(length)}
                            onClick={() => onChange({ averages: averages.includes(length) ? averages.filter((n) => n !== length) : [...averages, length].sort((a, b) => a - b) })}
                            className="h-7 px-2"
                        >
                            MA {length}
                        </ToolButton>
                    ))}
                </div>
                <div role="group" aria-label="Indicators" className="flex gap-1">
                    {INDICATOR_BUTTONS.map((item) => (
                        <ToolButton
                            key={item.id}
                            title={item.title}
                            pressed={indicators.includes(item.id)}
                            onClick={() => onChange({ indicators: indicators.includes(item.id) ? indicators.filter((id) => id !== item.id) : [...indicators, item.id] })}
                            className="h-7 px-2"
                        >
                            {item.label}
                        </ToolButton>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 pt-2 text-xs tabular-nums text-gray-500" aria-live="off">
                <span className="font-medium text-gray-400">{formatDay(bars.days[index])}</span>
                <span>O <span className="text-gray-100">{price(bars.open[index])}</span></span>
                <span>H <span className="text-gray-100">{price(bars.high[index])}</span></span>
                <span>L <span className="text-gray-100">{price(bars.low[index])}</span></span>
                <span>C <span className="text-gray-100">{price(bars.close[index])}</span></span>
                <span className={getChangeColorClass(change)}>{change === undefined ? "—" : formatChangePercent(change)}</span>
                <span>Vol <span className="text-gray-100">{VOLUME.format(bars.volume[index])}</span></span>
                {shownAverages.map((line) => (
                    <span key={line.length} className="inline-flex items-center gap-1">
                        <svg aria-hidden width="14" height="6" className="shrink-0">
                            <line x1="0" y1="3" x2="14" y2="3" strokeWidth="1.5" strokeDasharray={averageStyle(line.length).dashed ? "3 2" : undefined} className={line.length === 50 ? "stroke-gray-100" : "stroke-gray-500"} />
                        </svg>
                        MA {line.length} <span className="text-gray-100">{price(line.values[index])}</span>
                    </span>
                ))}
                {bands && (
                    <span>
                        BB {BOLLINGER.length}, {BOLLINGER.width} <span className="text-gray-100">{price(bands[index]?.upper)}</span> /{" "}
                        <span className="text-gray-100">{price(bands[index]?.middle)}</span> /{" "}
                        <span className="text-gray-100">{price(bands[index]?.lower)}</span>
                    </span>
                )}
                {rsi && (
                    <span>
                        RSI {RSI_LENGTH} <span className="text-gray-100">{oneDecimal(rsi[index])}</span>
                    </span>
                )}
            </div>

            <div
                ref={containerRef}
                role="img"
                tabIndex={0}
                aria-label={`${symbol} daily ${style === "candles" ? "candles" : "closes"} through ${throughDay}: close ${price(bars.close[last])}. Use the arrow keys to read other sessions; the values show above the chart.`}
                onKeyDown={onKeyDown}
                onBlur={() => {
                    chartRef.current?.chart.clearCrosshairPosition();
                    setPicked(undefined);
                }}
                className="relative min-h-0 flex-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-100"
            />

            <p className="border-t border-gray-600 px-3 py-1.5 text-[11px] text-gray-500">
                Alpaca daily bars (SIP, free plan) through {throughDay}, adjusted for splits and dividends, so older prices differ
                from what traded then. Fetched {formatNewYorkDay(payload.fetchedAt)}, {formatNewYorkTime(payload.fetchedAt)} ET
                {payload.stale ? " (an older saved copy; a newer one is on its way)" : ""}.
                {payload.skipped > 0 ? ` ${payload.skipped} bar${payload.skipped === 1 ? "" : "s"} without prices left out.` : ""}
            </p>
        </div>
    );
}
