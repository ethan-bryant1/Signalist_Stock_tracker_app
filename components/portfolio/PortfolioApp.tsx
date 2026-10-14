"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RotateCw, Trash2, X } from "lucide-react";
import Panel from "@/components/Panel";
import { ToolButton } from "@/components/ToolButton";
import BacktestResults from "@/components/portfolio/BacktestResults";
import { formatDay } from "@/components/portfolio/ValueChart";
import { savePortfolios } from "@/lib/actions/portfolio.actions";
import { MAX_HOLDINGS, runBacktest } from "@/lib/backtest";
import { formatNewYorkDay, formatNewYorkTime, type FeedIssue } from "@/lib/market-data";
import {
    MAX_NAME,
    MAX_PORTFOLIOS,
    backtestInput,
    equalWeights,
    neededSymbols,
    newPortfolio,
    sharedLastDay,
    totalWeight,
    type BarsPayload,
    type Portfolio,
    type PortfolioDoc,
    type PortfolioSettings,
    type SeriesPayload,
} from "@/lib/portfolio";
import { ISSUE_WORDS } from "@/lib/price-stamp";
import { cn } from "@/lib/utils";
import { isListSymbol, normalizeListSymbol } from "@/lib/watchlists";

type Props = {
    initial: PortfolioDoc;
    // "unavailable": the database couldn't be read, so changes aren't saved
    saving: "account" | "unavailable";
    userId: string;
    configured: boolean;
    watchlists: { id: string; name: string; symbols: string[] }[];
};

const newId = () => crypto.randomUUID().slice(0, 12);

const fieldClass =
    "h-9 rounded-lg border border-gray-600 bg-gray-900 px-3 text-sm text-gray-100 placeholder:text-gray-500 focus-visible:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-100";
const labelClass = "text-[11px] font-medium uppercase tracking-wider text-gray-500";

const RANGES: { value: PortfolioSettings["range"]; label: string }[] = [
    { value: "1y", label: "1Y" },
    { value: "3y", label: "3Y" },
    { value: "5y", label: "5Y" },
    { value: "max", label: "Max" },
    { value: "custom", label: "Custom" },
];

const STRATEGY_LABEL = (settings: PortfolioSettings) =>
    settings.strategy === "trend" ? `Trend filter (${settings.window}-day average)` : "Buy and hold";

export default function PortfolioApp({ initial, saving, userId, configured, watchlists }: Props) {
    const [doc, setDoc] = useState(initial);
    const [series, setSeries] = useState<Record<string, SeriesPayload>>({});
    const [failed, setFailed] = useState<Record<string, FeedIssue | "request">>({});
    const [loading, setLoading] = useState(false);
    const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
    const [adding, setAdding] = useState("");
    const [addError, setAddError] = useState<string | undefined>();
    const [benchmarkText, setBenchmarkText] = useState<string | undefined>();

    const active = doc.portfolios.find((p) => p.id === doc.activeId) ?? doc.portfolios[0];
    const { settings } = active;
    const needed = neededSymbols(active);
    const missing = needed.filter((symbol) => !series[symbol] && !failed[symbol]);
    const failedNeeded = needed.filter((symbol) => failed[symbol]);

    // ---------- saving ----------
    const firstSave = useRef(true);
    useEffect(() => {
        if (firstSave.current) {
            firstSave.current = false;
            return;
        }
        if (saving === "unavailable") return;
        const timer = setTimeout(() => {
            setSaveState("saving");
            savePortfolios(doc, userId)
                .then((result) => setSaveState(result.ok ? "saved" : "failed"))
                .catch(() => setSaveState("failed"));
        }, 800);
        return () => clearTimeout(timer);
    }, [doc, saving, userId]);

    // ---------- prices ----------
    // Loads the daily history of symbols the page doesn't have yet (one request; the server answers from its cache
    // and asks Alpaca at most once a day per symbol). Runs when holdings or the benchmark change, never on a timer.
    const missingKey = configured ? missing.join(",") : "";
    useEffect(() => {
        if (!missingKey) return;
        const symbols = missingKey.split(",");
        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);
            fetch(`/api/portfolio/bars?symbols=${encodeURIComponent(missingKey)}`)
                .then(async (res) => {
                    if (!res.ok) throw new Error(String(res.status));
                    const payload = (await res.json()) as BarsPayload;
                    if (cancelled) return;
                    setSeries((current) => ({ ...current, ...payload.series }));
                    setFailed((current) => {
                        const next = { ...current, ...payload.failed };
                        // A symbol with no bars at all is reported like a failure, so it isn't asked for again
                        for (const symbol of symbols) if (!payload.series[symbol] && !payload.failed[symbol]) next[symbol] = "request";
                        return next;
                    });
                })
                .catch(() => {
                    if (!cancelled) setFailed((current) => ({ ...current, ...Object.fromEntries(symbols.map((s) => [s, "request" as const])) }));
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [missingKey]);

    const retry = () => setFailed((current) => Object.fromEntries(Object.entries(current).filter(([symbol]) => !needed.includes(symbol))));

    // ---------- the backtest (recomputed in the browser whenever a setting changes; no requests) ----------
    const outcome = useMemo(() => {
        const symbols = neededSymbols(active);
        if (!active.holdings.length || symbols.some((symbol) => !series[symbol])) return undefined;
        const loaded = Object.fromEntries(symbols.map((symbol) => [symbol, series[symbol]]));
        const lastDay = sharedLastDay(Object.values(loaded));
        if (!lastDay) return undefined;
        return runBacktest(backtestInput(active, loaded, lastDay));
    }, [active, series]);

    // ---------- editing ----------
    const update = (change: (portfolio: Portfolio) => Portfolio) =>
        setDoc((current) => ({ ...current, portfolios: current.portfolios.map((p) => (p.id === current.activeId ? change(p) : p)) }));
    const setSettings = (patch: Partial<PortfolioSettings>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    const setHoldings = (holdings: Portfolio["holdings"]) => update((p) => ({ ...p, holdings }));

    const addSymbol = () => {
        const symbol = normalizeListSymbol(adding);
        if (!isListSymbol(symbol)) return setAddError("Type a ticker like AAPL or BRK.B.");
        if (active.holdings.some((h) => h.symbol === symbol)) return setAddError(`${symbol} is already in this portfolio.`);
        if (active.holdings.length >= MAX_HOLDINGS) return setAddError(`A portfolio holds up to ${MAX_HOLDINGS} symbols.`);
        const symbols = [...active.holdings.map((h) => h.symbol), symbol];
        setHoldings(symbols.map((s, i) => ({ symbol: s, weight: equalWeights(symbols.length)[i] })));
        setAdding("");
        setAddError(undefined);
    };

    // Removing from equally weighted holdings keeps them equal; custom weights are left for the owner to adjust
    const removeHolding = (index: number) => {
        const rest = active.holdings.filter((_, k) => k !== index);
        const equal = equalWeights(active.holdings.length);
        const wasEqual = active.holdings.every((h, k) => h.weight === equal[k]) || new Set(active.holdings.map((h) => h.weight)).size === 1;
        setHoldings(wasEqual ? rest.map((h, k) => ({ ...h, weight: equalWeights(rest.length)[k] })) : rest);
    };

    const fromWatchlist = (id: string) => {
        const list = watchlists.find((w) => w.id === id);
        if (!list) return;
        const symbols = list.symbols.slice(0, MAX_HOLDINGS);
        const weights = equalWeights(symbols.length);
        setHoldings(symbols.map((symbol, i) => ({ symbol, weight: weights[i] })));
    };

    const addPortfolio = () => {
        if (doc.portfolios.length >= MAX_PORTFOLIOS) return;
        const id = newId();
        setDoc((current) => ({ ...current, activeId: id, portfolios: [...current.portfolios, newPortfolio(id, `Portfolio ${current.portfolios.length + 1}`)] }));
    };
    const deletePortfolio = () => {
        if (doc.portfolios.length <= 1) return;
        if (!window.confirm(`Delete "${active.name}"? Its holdings and settings will be removed.`)) return;
        setDoc((current) => {
            const portfolios = current.portfolios.filter((p) => p.id !== current.activeId);
            return { ...current, activeId: portfolios[0].id, portfolios };
        });
    };

    const commitBenchmark = () => {
        if (benchmarkText === undefined) return;
        const symbol = normalizeListSymbol(benchmarkText);
        if (isListSymbol(symbol)) setSettings({ benchmark: symbol });
        setBenchmarkText(undefined);
    };

    const total = totalWeight(active.holdings);
    const result = outcome?.ok ? outcome : undefined;

    // Where the prices came from and how old they are
    const shown = needed.map((symbol) => series[symbol]).filter(Boolean);
    const oldestFetch = shown.length ? Math.min(...shown.map((s) => s.fetchedAt)) : undefined;
    const skipped = needed.filter((symbol) => series[symbol]?.skipped);
    const source = result && (
        <>
            Alpaca daily bars (SIP feed, free plan), adjusted for splits and dividends. Sessions {formatDay(result.days[0])} to{" "}
            {formatDay(result.days[result.days.length - 1])}, {result.days.length} in all.
            {oldestFetch !== undefined && <> Fetched {formatNewYorkDay(oldestFetch)}, {formatNewYorkTime(oldestFetch)} ET.</>}
            {shown.some((s) => s.stale) && <> Some histories are a saved copy from before the latest session; a newer one is loading for next time.</>}
            {skipped.length > 0 && <> Bars skipped for a missing price: {skipped.map((s) => `${s} ${series[s].skipped}`).join(", ")}.</>}
        </>
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Which portfolio */}
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                    <span className={labelClass}>Portfolio</span>
                    <select aria-label="Portfolio" className={cn(fieldClass, "pr-8")} value={active.id} onChange={(e) => setDoc((current) => ({ ...current, activeId: e.target.value }))}>
                        {doc.portfolios.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className={labelClass}>Name</span>
                    <input className={cn(fieldClass, "w-48")} value={active.name} maxLength={MAX_NAME} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />
                </label>
                <ToolButton title="New portfolio" onClick={addPortfolio} disabled={doc.portfolios.length >= MAX_PORTFOLIOS} className="h-9">
                    <Plus aria-hidden className="h-3.5 w-3.5" /> New
                </ToolButton>
                <ToolButton title="Delete this portfolio" onClick={deletePortfolio} disabled={doc.portfolios.length <= 1} className="h-9">
                    <Trash2 aria-hidden className="h-3.5 w-3.5" /> Delete
                </ToolButton>
                <span className="ml-auto self-center text-xs text-gray-500" role="status">
                    {saving === "unavailable" ? "The database didn't answer: changes on this page aren't saved." : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Couldn't save the last change." : "Saved to your account"}
                </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* Holdings */}
                <Panel title="Holdings" description="Target weights, kept by rebalancing">
                    <div className="flex flex-col gap-3 p-4">
                        {active.holdings.length === 0 ? (
                            <p className="text-sm text-gray-500">No holdings yet. Add symbols below or start from one of your watchlists.</p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-gray-700">
                                {active.holdings.map((holding, i) => (
                                    <li key={holding.symbol} className="flex items-center gap-3 py-1.5">
                                        <Link href={`/stocks/${encodeURIComponent(holding.symbol)}`} className="w-20 truncate text-sm font-semibold text-gray-100 hover:underline">
                                            {holding.symbol}
                                        </Link>
                                        <span className="flex-1 truncate text-xs text-gray-500">
                                            {failed[holding.symbol] ? (failed[holding.symbol] === "request" ? "No daily prices found" : `No prices: ${ISSUE_WORDS[failed[holding.symbol] as FeedIssue]}`) : series[holding.symbol] ? `History from ${formatDay(series[holding.symbol].days[0])}` : configured ? "Loading prices…" : ""}
                                        </span>
                                        <label className="flex items-center gap-1 text-sm text-gray-500">
                                            <span className="sr-only">Weight of {holding.symbol} in percent</span>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                max={100}
                                                step={0.01}
                                                className={cn(fieldClass, "h-8 w-24 text-right tabular-nums")}
                                                value={holding.weight}
                                                onChange={(e) => {
                                                    const weight = Math.round(Math.min(100, Math.max(0, Number(e.target.value) || 0)) * 100) / 100;
                                                    setHoldings(active.holdings.map((h, k) => (k === i ? { ...h, weight } : h)));
                                                }}
                                            />
                                            %
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => removeHolding(i)}
                                            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100"
                                            aria-label={`Remove ${holding.symbol}`}
                                        >
                                            <X aria-hidden className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-600 pt-3 text-sm">
                            <span className={cn("tabular-nums", Math.abs(total - 100) > 0.005 ? "font-semibold text-gray-100" : "text-gray-500")}>
                                Total {total.toFixed(2)}%{Math.abs(total - 100) > 0.005 && active.holdings.length > 0 ? " · weights must add up to 100%" : ""}
                            </span>
                            <ToolButton title="Give every holding the same weight" onClick={() => setHoldings(active.holdings.map((h, i) => ({ ...h, weight: equalWeights(active.holdings.length)[i] })))} disabled={!active.holdings.length}>
                                Equal weights
                            </ToolButton>
                        </div>
                        <form
                            className="flex flex-wrap items-start gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                addSymbol();
                            }}
                        >
                            <div className="flex min-w-40 flex-1 flex-col gap-1">
                                <label htmlFor="portfolio-add" className="sr-only">
                                    Add a symbol
                                </label>
                                <input
                                    id="portfolio-add"
                                    className={cn(fieldClass, "uppercase placeholder:normal-case")}
                                    placeholder="Add a symbol, like AAPL"
                                    value={adding}
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-invalid={!!addError}
                                    aria-describedby={addError ? "portfolio-add-error" : undefined}
                                    onChange={(e) => {
                                        setAdding(e.target.value);
                                        setAddError(undefined);
                                    }}
                                />
                                {addError && (
                                    <p id="portfolio-add-error" className="text-xs text-gray-100">
                                        {addError}
                                    </p>
                                )}
                            </div>
                            <ToolButton title="Add the symbol (equal weights)" type="submit" className="h-9">
                                <Plus aria-hidden className="h-3.5 w-3.5" /> Add
                            </ToolButton>
                            {watchlists.length > 0 && (
                                <select
                                    aria-label="Replace the holdings with a watchlist's symbols, equally weighted"
                                    className={cn(fieldClass, "pr-8")}
                                    value=""
                                    onChange={(e) => fromWatchlist(e.target.value)}
                                >
                                    <option value="" disabled>
                                        From a watchlist…
                                    </option>
                                    {watchlists.map((list) => (
                                        <option key={list.id} value={list.id} disabled={!list.symbols.length}>
                                            {list.name} ({list.symbols.length})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </form>
                    </div>
                </Panel>

                {/* Settings */}
                <Panel title="Backtest settings" description="Changes recompute at once, with no new requests">
                    <div className="grid gap-4 p-4 sm:grid-cols-2">
                        <fieldset className="flex flex-col gap-1 sm:col-span-2">
                            <legend className={cn(labelClass, "mb-1")}>Period</legend>
                            <div className="flex flex-wrap items-center gap-2">
                                {RANGES.map((range) => (
                                    <ToolButton key={range.value} title={range.value === "max" ? "All shared history (Alpaca's free plan starts in 2016)" : range.label} pressed={settings.range === range.value} onClick={() => setSettings({ range: range.value })}>
                                        {range.label}
                                    </ToolButton>
                                ))}
                                {settings.range === "custom" && (
                                    <>
                                        <label className="flex items-center gap-1 text-xs text-gray-500">
                                            From
                                            <input type="date" className={cn(fieldClass, "h-8")} min="2016-01-01" value={settings.start ?? ""} onChange={(e) => setSettings({ start: e.target.value || undefined })} />
                                        </label>
                                        <label className="flex items-center gap-1 text-xs text-gray-500">
                                            To
                                            <input type="date" className={cn(fieldClass, "h-8")} min="2016-01-01" value={settings.end ?? ""} onChange={(e) => setSettings({ end: e.target.value || undefined })} />
                                        </label>
                                    </>
                                )}
                            </div>
                        </fieldset>
                        <label className="flex flex-col gap-1">
                            <span className={labelClass}>Strategy</span>
                            <select aria-label="Strategy" className={cn(fieldClass, "pr-8")} value={settings.strategy} onChange={(e) => setSettings({ strategy: e.target.value as PortfolioSettings["strategy"] })}>
                                <option value="hold">Buy and hold</option>
                                <option value="trend">Trend filter: hold only above the moving average</option>
                            </select>
                        </label>
                        <label className={cn("flex flex-col gap-1", settings.strategy !== "trend" && "opacity-50")}>
                            <span className={labelClass}>Moving average (sessions)</span>
                            <input
                                type="number"
                                min={5}
                                max={400}
                                step={1}
                                disabled={settings.strategy !== "trend"}
                                className={cn(fieldClass, "tabular-nums")}
                                value={settings.window}
                                onChange={(e) => setSettings({ window: Math.round(Math.min(400, Math.max(5, Number(e.target.value) || 5))) })}
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className={labelClass}>Rebalance</span>
                            <select aria-label="Rebalance" className={cn(fieldClass, "pr-8")} value={settings.rebalance} onChange={(e) => setSettings({ rebalance: e.target.value as PortfolioSettings["rebalance"] })}>
                                <option value="none">Never (let weights drift)</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className={labelClass}>Costs per trade (basis points)</span>
                            <input
                                type="number"
                                min={0}
                                max={500}
                                step={1}
                                className={cn(fieldClass, "tabular-nums")}
                                value={settings.costBps}
                                aria-describedby="portfolio-cost-hint"
                                onChange={(e) => setSettings({ costBps: Math.min(500, Math.max(0, Number(e.target.value) || 0)) })}
                            />
                            <span id="portfolio-cost-hint" className="text-[11px] text-gray-500">
                                Commission and slippage on each dollar traded; 5 = 0.05%
                            </span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className={labelClass}>Out-of-sample (held-out end)</span>
                            <select aria-label="Out-of-sample period" className={cn(fieldClass, "pr-8")} value={settings.outOfSample} onChange={(e) => setSettings({ outOfSample: Number(e.target.value) })}>
                                {[0, 20, 30, 40, 50].map((share) => (
                                    <option key={share} value={share}>
                                        {share ? `Last ${share}% of sessions` : "None"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className={labelClass}>Benchmark</span>
                            <input
                                className={cn(fieldClass, "uppercase")}
                                value={benchmarkText ?? settings.benchmark}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(e) => setBenchmarkText(e.target.value)}
                                onBlur={commitBenchmark}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitBenchmark();
                                    if (e.key === "Escape") setBenchmarkText(undefined);
                                }}
                            />
                        </label>
                    </div>
                </Panel>
            </div>

            {/* Results */}
            {!configured ? (
                <SetupNotice />
            ) : !active.holdings.length ? null : failedNeeded.length ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm">
                    <p className="text-gray-400">
                        <span className="font-semibold text-gray-100">No backtest:</span>{" "}
                        {failedNeeded
                            .map((symbol) => `${symbol} (${failed[symbol] === "request" ? "no daily prices found" : ISSUE_WORDS[failed[symbol] as FeedIssue]})`)
                            .join(", ")}
                        . Nothing is filled in for missing prices.
                    </p>
                    <ToolButton title="Ask for those prices again" onClick={retry}>
                        <RotateCw aria-hidden className="h-3.5 w-3.5" /> Try again
                    </ToolButton>
                </div>
            ) : loading || !outcome ? (
                <p className="rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-500" role="status">
                    Loading daily prices for {missing.join(", ") || "the holdings"}…
                </p>
            ) : !outcome.ok ? (
                <p className="rounded-xl border border-gray-600 bg-gray-800 p-4 text-sm text-gray-400" role="status">
                    <span className="font-semibold text-gray-100">No backtest yet:</span> {outcome.reason}
                </p>
            ) : (
                <BacktestResults result={outcome} benchmark={settings.benchmark} strategy={`${STRATEGY_LABEL(settings)}, ${settings.rebalance === "none" ? "no rebalancing" : `rebalanced ${settings.rebalance}`}`} source={source} />
            )}
        </div>
    );
}

// What to do when the server has no Alpaca keys: no figures are shown
function SetupNotice() {
    return (
        <section role="status" className="flex flex-col gap-2 rounded-xl border border-gray-600 bg-gray-800 p-6">
            <h2 className="text-base font-semibold text-gray-100">Add your free Alpaca keys to run backtests</h2>
            <p className="max-w-3xl text-sm text-gray-500">
                Backtests use daily prices from Alpaca&apos;s free market-data plan. Create a free Alpaca account (paper trading is enough), make an API
                key, and put it in the app&apos;s <code className="text-gray-100">.env</code> file as <code className="text-gray-100">ALPACA_API_KEY_ID</code> and{" "}
                <code className="text-gray-100">ALPACA_API_SECRET_KEY</code>, then restart the server. Until then no figures are shown; your portfolios
                still save.
            </p>
        </section>
    );
}
