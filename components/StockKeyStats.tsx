import type { StockOverview } from "@/lib/stock-data";
import { KEY_STATS, type KeyStat } from "@/lib/instrument";
import { formatCurrency, formatMarketCapValue } from "@/lib/utils";

const LABELS: Record<KeyStat, string> = {
    previousClose: "Previous close",
    open: "Open",
    dayRange: "Day range",
    week52Range: "52-week range",
    marketCap: "Market cap",
    peRatio: "P/E ratio (TTM)",
    eps: "EPS (TTM)",
    dividendYield: "Dividend yield",
    beta: "Beta",
};

// Grid of the figures that apply to this kind of instrument (a fund has no P/E or EPS); anything Finnhub doesn't
// have shows as a dash
const StockKeyStats = ({ overview }: { overview: StockOverview }) => {
    const { currency } = overview;
    const money = (value?: number) => (value !== undefined ? formatCurrency(value, currency) : undefined);
    const range = (low?: number, high?: number) =>
        low !== undefined && high !== undefined ? `${money(low)} – ${money(high)}` : undefined;

    const values: Record<KeyStat, string | undefined> = {
        previousClose: money(overview.previousClose),
        open: money(overview.open),
        dayRange: range(overview.dayLow, overview.dayHigh),
        week52Range: range(overview.week52Low, overview.week52High),
        marketCap: overview.marketCap ? formatMarketCapValue(overview.marketCap) : undefined,
        peRatio: overview.peRatio?.toFixed(2),
        eps: money(overview.eps),
        dividendYield: overview.dividendYield !== undefined ? `${overview.dividendYield.toFixed(2)}%` : undefined,
        beta: overview.beta?.toFixed(2),
    };

    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {KEY_STATS[overview.kind].map((key) => (
                <div key={key} className="min-w-0 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3">
                    <dt className="text-xs font-medium text-gray-500">{LABELS[key]}</dt>
                    <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-100 sm:text-base" title={values[key]}>
                        {values[key] ?? "—"}
                    </dd>
                </div>
            ))}
        </dl>
    );
};

export default StockKeyStats;
