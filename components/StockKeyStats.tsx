import type { StockOverview } from "@/lib/actions/finnhub.actions";
import { formatCurrency, formatMarketCapValue } from "@/lib/utils";

// Grid of the stock's key figures; anything Finnhub doesn't have shows as a dash
const StockKeyStats = ({ overview }: { overview: StockOverview }) => {
    const { currency } = overview;
    const money = (value?: number) => (value !== undefined ? formatCurrency(value, currency) : undefined);
    const range = (low?: number, high?: number) =>
        low !== undefined && high !== undefined ? `${money(low)} – ${money(high)}` : undefined;

    const stats = [
        { label: "Previous close", value: money(overview.previousClose) },
        { label: "Open", value: money(overview.open) },
        { label: "Day range", value: range(overview.dayLow, overview.dayHigh) },
        { label: "52-week range", value: range(overview.week52Low, overview.week52High) },
        { label: "Market cap", value: overview.marketCap ? formatMarketCapValue(overview.marketCap) : undefined },
        { label: "P/E ratio (TTM)", value: overview.peRatio?.toFixed(2) },
        { label: "EPS (TTM)", value: money(overview.eps) },
        { label: "Dividend yield", value: overview.dividendYield !== undefined ? `${overview.dividendYield.toFixed(2)}%` : undefined },
    ];

    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ label, value }) => (
                <div key={label} className="min-w-0 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3">
                    <dt className="text-xs font-medium text-gray-500">{label}</dt>
                    <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-100 sm:text-base" title={value}>
                        {value ?? "—"}
                    </dd>
                </div>
            ))}
        </dl>
    );
};

export default StockKeyStats;
