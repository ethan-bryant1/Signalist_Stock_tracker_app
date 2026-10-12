import { AlertTriangle } from "lucide-react";
import type { HeatmapFeed } from "@/hooks/useHeatmapFeed";
import { FULL_COLOR_AT, LEGEND_TICKS, legendGradient, type HeatPalette } from "@/lib/heatmap";
import { formatNewYorkMoment, type FeedAssessment, type FeedIssue, type HeatmapStock } from "@/lib/market-data";
import { cn } from "@/lib/utils";

const GRADIENT = legendGradient();

const ISSUE_TEXT: Record<FeedIssue, string> = {
    "not-configured": "Prices unavailable: the server has no Finnhub API key",
    auth: "Finnhub rejected the API key, so prices couldn't load",
    "rate-limit": "Finnhub's rate limit was hit, so some prices didn't load",
    provider: "Finnhub returned errors for some prices",
    network: "Finnhub couldn't be reached for some prices",
};

const PALETTE_WORDS: Record<HeatPalette, { down: string; up: string }> = {
    classic: { down: "red", up: "green" },
    cvd: { down: "orange", up: "blue" },
};

// The color scale: the same mix as the tiles from −3% to +3%, with a mark at every whole percent. The colors come
// from the CSS variables of the nearest data-heat-palette, so palette only changes the wording read to screen readers.
export const HeatmapLegend = ({ className, palette = "classic" }: { className?: string; palette?: HeatPalette }) => {
    const words = PALETTE_WORDS[palette];
    return (
        <div
            role="img"
            aria-label={`Color scale: gray for moves within ±0.05%, deepening to full ${words.down} at −${FULL_COLOR_AT}% or lower and full ${words.up} at +${FULL_COLOR_AT}% or higher. Striped tiles have an old or missing price.`}
            className={cn("flex shrink-0 items-center gap-3 text-[10px] tabular-nums text-gray-500", className)}
        >
            <div className="flex items-center gap-1.5">
                <span>≤−{FULL_COLOR_AT}%</span>
                <div className="w-32 sm:w-40">
                    <div className="h-2 rounded-[2px]" style={{ background: GRADIENT }} />
                    <div className="relative mt-0.5 h-3">
                        {LEGEND_TICKS.slice(1, -1).map((tick) => (
                            <span
                                key={tick}
                                className="absolute top-0 -translate-x-1/2 leading-3"
                                style={{ left: `${((tick + FULL_COLOR_AT) / (2 * FULL_COLOR_AT)) * 100}%` }}
                            >
                                {tick > 0 ? `+${tick}` : tick < 0 ? `−${-tick}` : "0"}
                            </span>
                        ))}
                    </div>
                </div>
                <span>≥+{FULL_COLOR_AT}%</span>
            </div>
            <span className="flex items-center gap-1">
                {/* The same dark stripes as a stale tile (STALE_STRIPE_ALPHA in StockHeatmap) */}
                <span className="h-3 w-3 rounded-[2px] bg-[color:var(--heat-flat)] bg-[repeating-linear-gradient(135deg,transparent_0_2px,rgb(0_0_0/0.3)_2px_3px)]" />
                Stale
            </span>
        </div>
    );
};

// How many stocks left off the map are named inline before the list moves into a disclosure
const UNPLACED_INLINE = 4;

// Why the live trade stream isn't running, for the status line's tooltip
const STREAM_OFF_TEXT: Record<string, string> = {
    "not-configured": "The server has no Finnhub API key.",
    unsupported: "The server's Node.js is older than version 22, which the live stream needs.",
    refused: "Finnhub turned the stream down: another tab or computer may already be streaming with this key. Trying again shortly.",
    dropped: "The connection dropped. Trying again shortly.",
};

type HeatmapStatusProps = {
    feed: Pick<HeatmapFeed, "refreshError" | "failingSince" | "issue" | "failedRequests" | "lastSuccessAt" | "live">;
    assessment: FeedAssessment;
    // The stocks on this map, which can be one focused sector
    stocks: readonly Pick<HeatmapStock, "symbol">[];
    unplaced: readonly HeatmapStock[];
    now: number;
    className?: string;
};

// What the map shows and how current it is: the period, how many stocks have prices, how many are stale,
// any left off the map, the time of the newest price and the source. Problems come first.
export const HeatmapStatus = ({ feed, assessment, stocks, unplaced, now, className }: HeatmapStatusProps) => {
    const { period, priced, stale, newestQuoteTime } = assessment;
    const total = stocks.length;
    const streaming = new Set(feed.live.symbols);
    const streamed = stocks.filter((stock) => streaming.has(stock.symbol)).length;
    const problem =
        feed.refreshError === "signed-out"
            ? "Signed out: sign in again to refresh prices"
            : feed.refreshError
                ? `Refresh failing${feed.failingSince ? ` since ${formatNewYorkMoment(feed.failingSince, now)}` : ""}; showing the last prices received`
                : feed.issue && (priced < total || feed.failedRequests > 0)
                    ? ISSUE_TEXT[feed.issue]
                    : undefined;

    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-gray-500", className)}>
            <span role="status" className="contents">
                {problem && (
                    <span className="inline-flex items-center gap-1 font-medium text-gray-100">
                        <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
                        {problem}
                    </span>
                )}
            </span>
            {feed.live.state === "live" && streamed > 0 && (
                <>
                    <span
                        data-live-badge
                        className="inline-flex items-center gap-1.5 font-semibold text-gray-100"
                        title={`Every trade moves ${streamed === total ? "these stocks" : `${streamed} of these stocks`} within a second or two${total > streamed ? `; the other ${total - streamed} ${total - streamed === 1 ? "updates" : "update"} every minute` : ""}`}
                    >
                        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-100 motion-reduce:animate-none" />
                        Live
                        <span className="sr-only">: {streamed} of {total} stocks update with every trade</span>
                    </span>
                    <span aria-hidden>·</span>
                </>
            )}
            {feed.live.state === "off" && feed.live.reason && !feed.refreshError && (
                <>
                    <span className="text-gray-400" title={STREAM_OFF_TEXT[feed.live.reason] ?? STREAM_OFF_TEXT.dropped}>
                        Live stream off · updating every minute
                    </span>
                    <span aria-hidden>·</span>
                </>
            )}
            <span className="font-medium text-gray-400">
                1D · {period.label}
                {period.day ? ` (${period.day})` : ""}
            </span>
            <span aria-hidden>·</span>
            <span>
                {priced} of {total} priced
            </span>
            {stale > 0 && (
                <>
                    <span aria-hidden>·</span>
                    <span className="text-gray-400">{stale} stale</span>
                </>
            )}
            {unplaced.length > 0 && (
                <>
                    <span aria-hidden>·</span>
                    {unplaced.length <= UNPLACED_INLINE ? (
                        <span>
                            {unplaced.length} not drawn (no market cap): {unplaced.map((stock) => stock.symbol).join(", ")}
                        </span>
                    ) : (
                        // Too many to list inline: a disclosure names every one, so none is hidden behind "…"
                        <details className="min-w-0">
                            <summary className="cursor-pointer list-none underline decoration-gray-600 underline-offset-2 hover:text-gray-400 [&::-webkit-details-marker]:hidden">
                                {unplaced.length} not drawn (no market cap)
                            </summary>
                            <span className="block text-gray-400">{unplaced.map((stock) => stock.symbol).join(", ")}</span>
                        </details>
                    )}
                </>
            )}
            {newestQuoteTime !== undefined && (
                <>
                    <span aria-hidden>·</span>
                    <span>Newest price {formatNewYorkMoment(newestQuoteTime, now)}</span>
                </>
            )}
            <span aria-hidden>·</span>
            <span>Finnhub</span>
        </div>
    );
};
