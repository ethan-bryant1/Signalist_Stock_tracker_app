"use client";

import Panel from "@/components/Panel";
import ValueChart, { formatDay } from "@/components/portfolio/ValueChart";
import { ASSUMPTIONS, type BacktestResult, type Stats } from "@/lib/backtest";
import { cn, getChangeColorClass } from "@/lib/utils";

const MISSING = "—";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money = (value: number) => (Number.isFinite(value) ? MONEY.format(value) : MISSING);

// A fraction as a percent: 0.1234 → "+12.34%"
export const percent = (value: number | undefined, signed = true) => {
    if (value === undefined || !Number.isFinite(value)) return MISSING;
    // A tiny negative rounds to "-0.00"; it's shown as 0.00
    const text = (value * 100).toFixed(2).replace(/^-0\.00$/, "0.00");
    return `${signed && value > 0 && text !== "0.00" ? "+" : ""}${text}%`;
};
const ratio = (value: number | undefined) => (value === undefined || !Number.isFinite(value) ? MISSING : value.toFixed(2).replace(/^-0\.00$/, "0.00"));

// Gains green and losses red, judged on the shown figure
const tone = (value: number | undefined) => (value === undefined ? "text-gray-500" : getChangeColorClass(value * 100));

type Metric = { label: string; hint: string; value: (s: Stats) => number | undefined; text: (v: number | undefined) => string; colored?: boolean };

const METRICS: Metric[] = [
    { label: "Total return", hint: "Last close against the money put in, costs included", value: (s) => s.totalReturn, text: percent, colored: true },
    { label: "Annual return", hint: "Compound yearly growth over calendar time; shown for a year or more", value: (s) => s.annualReturn, text: percent, colored: true },
    { label: "Volatility", hint: "Standard deviation of daily returns × √252", value: (s) => s.volatility, text: (v) => percent(v, false) },
    { label: "Sharpe", hint: "Average daily return ÷ its standard deviation, × √252, with a 0% risk-free rate", value: (s) => s.sharpe, text: ratio },
    { label: "Max drawdown", hint: "Largest fall from a high, close to close", value: (s) => s.maxDrawdown, text: percent, colored: true },
    { label: "Best day", hint: "Largest one-session gain", value: (s) => s.bestDay, text: percent, colored: true },
    { label: "Worst day", hint: "Largest one-session loss", value: (s) => s.worstDay, text: percent, colored: true },
];

const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500 first:text-left", className)}>
        {children}
    </th>
);
const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-100 first:text-left", className)}>{children}</td>
);

const Figure = ({ metric, stats }: { metric: Metric; stats: Stats }) => {
    const value = metric.value(stats);
    return <span className={cn(metric.colored && tone(value), value === undefined && "text-gray-500")}>{metric.text(value)}</span>;
};

type Props = {
    result: BacktestResult;
    benchmark: string;
    strategy: string;
    source: React.ReactNode;
};

export default function BacktestResults({ result, benchmark, strategy, source }: Props) {
    const full = result.full;
    const segments = [result.full, ...result.segments];
    const showCorrelations = result.assets.length > 1;

    return (
        <div className="flex flex-col gap-4">
            <section aria-label="Summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-600 bg-gray-600 sm:grid-cols-3 lg:grid-cols-5">
                {METRICS.slice(0, 5).map((metric) => (
                    <div key={metric.label} className="flex flex-col gap-1 bg-gray-800 px-4 py-3" title={metric.hint}>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{metric.label}</span>
                        <span className="text-xl font-semibold tabular-nums">
                            <Figure metric={metric} stats={full.portfolio} />
                        </span>
                        <span className="text-xs tabular-nums text-gray-500">
                            {benchmark} <Figure metric={{ ...metric, colored: false }} stats={full.benchmark} />
                        </span>
                    </div>
                ))}
            </section>

            <Panel title="Growth of $10,000" description={`${strategy} against ${benchmark}, bought and held, costs included`}>
                <div className="flex flex-col gap-6 p-4">
                    <ValueChart
                        title="Value at each close"
                        days={result.days}
                        lines={[
                            { label: "Portfolio", values: result.portfolio },
                            { label: benchmark, values: result.benchmark, dashed: true, muted: true },
                        ]}
                        format={money}
                        splitDay={result.splitDay}
                    />
                    <ValueChart
                        title="Drawdown from the previous high"
                        days={result.days}
                        lines={[
                            { label: "Portfolio", values: result.drawdown },
                            { label: benchmark, values: result.benchmarkDrawdown, dashed: true, muted: true },
                        ]}
                        format={(v) => percent(v, false)}
                        area
                        splitDay={result.splitDay}
                        height={120}
                    />
                    <p className="text-xs text-gray-500">{source}</p>
                </div>
            </Panel>

            <Panel title="Performance" description={result.segments.length ? "In-sample is the earlier part, out-of-sample the held-out end. Judge a strategy on the out-of-sample part." : "No out-of-sample period held out"}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-600">
                            <tr>
                                <Th>Period</Th>
                                <Th>Sessions</Th>
                                {METRICS.map((metric) => (
                                    <Th key={metric.label}>
                                        <abbr title={metric.hint} className="no-underline">
                                            {metric.label}
                                        </abbr>
                                    </Th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {segments.flatMap((segment) =>
                                (["portfolio", "benchmark"] as const).map((who) => (
                                    <tr key={`${segment.label}-${who}`} className={cn(who === "benchmark" && "text-gray-500")}>
                                        <Td>
                                            {who === "portfolio" ? (
                                                <>
                                                    <span className="font-medium">{segment.label}</span>
                                                    <span className="block text-xs font-normal text-gray-500">
                                                        {formatDay(segment.portfolio.startDay)} – {formatDay(segment.portfolio.endDay)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="pl-3 text-gray-500">{benchmark}</span>
                                            )}
                                        </Td>
                                        <Td className="text-gray-500">{segment[who].sessions}</Td>
                                        {METRICS.map((metric) => (
                                            <Td key={metric.label}>
                                                <Figure metric={metric} stats={segment[who]} />
                                            </Td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-600 px-4 py-3 text-xs text-gray-500">
                    <div title="How much the portfolio moved per 1% move of the benchmark, from daily returns">
                        <dt className="inline">Beta to {benchmark}: </dt>
                        <dd className="inline tabular-nums text-gray-100">{ratio(result.beta)}</dd>
                    </div>
                    <div>
                        <dt className="inline">Correlation with {benchmark}: </dt>
                        <dd className="inline tabular-nums text-gray-100">{ratio(result.correlation)}</dd>
                    </div>
                    <div>
                        <dt className="inline">Trades: </dt>
                        <dd className="inline tabular-nums text-gray-100">{result.trades}</dd>
                    </div>
                    <div>
                        <dt className="inline">Traded: </dt>
                        <dd className="inline tabular-nums text-gray-100">{money(result.turnover)}</dd>
                    </div>
                    <div>
                        <dt className="inline">Costs paid: </dt>
                        <dd className="inline tabular-nums text-gray-100">{money(result.costs)}</dd>
                    </div>
                </dl>
            </Panel>

            <div className={cn("grid gap-4", showCorrelations && "xl:grid-cols-2")}>
                <Panel title="Holdings" description="Each one bought at the first open and held, without costs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-600">
                                <tr>
                                    <Th>Symbol</Th>
                                    <Th>Weight</Th>
                                    <Th>Total return</Th>
                                    <Th>Annual</Th>
                                    <Th>Volatility</Th>
                                    <Th>Max drawdown</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {result.assets.map((asset) => (
                                    <tr key={asset.symbol}>
                                        <Td className="font-medium">{asset.symbol}</Td>
                                        <Td>{percent(asset.weight, false)}</Td>
                                        <Td className={tone(asset.stats.totalReturn)}>{percent(asset.stats.totalReturn)}</Td>
                                        <Td className={tone(asset.stats.annualReturn)}>{percent(asset.stats.annualReturn)}</Td>
                                        <Td>{percent(asset.stats.volatility, false)}</Td>
                                        <Td className={tone(asset.stats.maxDrawdown)}>{percent(asset.stats.maxDrawdown)}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
                {showCorrelations && (
                    <Panel title="Correlation of daily returns" description="1 moves together, 0 unrelated, −1 opposite">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-gray-600">
                                    <tr>
                                        <Th>
                                            <span className="sr-only">Symbol</span>
                                        </Th>
                                        {result.assets.map((asset) => (
                                            <Th key={asset.symbol}>{asset.symbol}</Th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {result.assets.map((row, a) => (
                                        <tr key={row.symbol}>
                                            <th scope="row" className="px-3 py-2 text-left font-medium text-gray-100">
                                                {row.symbol}
                                            </th>
                                            {result.correlations[a].map((value, b) => (
                                                <Td key={b} className={cn(a === b && "text-gray-500")}>
                                                    {ratio(value)}
                                                </Td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                )}
            </div>

            <Panel title="Calendar years" description="Close of the previous year's last session to this year's last close">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-600">
                            <tr>
                                <Th>Year</Th>
                                <Th>Portfolio</Th>
                                <Th>{benchmark}</Th>
                                <Th>Difference</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {result.years.map((year) => (
                                <tr key={year.year}>
                                    <Td>
                                        {year.year}
                                        {year.partial && <span className="ml-2 text-xs text-gray-500">part year</span>}
                                    </Td>
                                    <Td className={tone(year.portfolio)}>{percent(year.portfolio)}</Td>
                                    <Td className={tone(year.benchmark)}>{percent(year.benchmark)}</Td>
                                    <Td className="text-gray-400">{percent(year.portfolio - year.benchmark)}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <Panel title="Method and assumptions">
                <ul className="flex list-disc flex-col gap-1.5 py-4 pl-8 pr-4 text-sm text-gray-400">
                    {result.notes.map((note) => (
                        <li key={note} className="text-gray-100">
                            {note}
                        </li>
                    ))}
                    {ASSUMPTIONS.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </Panel>
        </div>
    );
}
