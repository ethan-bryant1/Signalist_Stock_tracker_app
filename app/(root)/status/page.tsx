import type { Metadata } from "next";
import BackToDashboard from "@/components/BackToDashboard";
import { alpacaConfigured } from "@/lib/alpaca";
import { getFinnhubToken } from "@/lib/finnhub";
import { getFredKey } from "@/lib/fred";
import { finnhubStreamHub } from "@/lib/finnhub-stream";
import { formatNewYorkMoment } from "@/lib/market-data";
import { ISSUE_WORDS } from "@/lib/price-stamp";
import { processStartedAt, providerUsage } from "@/lib/providers/registry";
import type { GateUsage } from "@/lib/providers/gate";

export const metadata: Metadata = { title: "Data Status · Loops Watch" };
export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, { name: string; limit: string }> = {
    finnhub: { name: "Finnhub", limit: "free plan: about 60 calls a minute" },
    fred: { name: "FRED", limit: "free key: 120 calls a minute" },
    alpaca: { name: "Alpaca", limit: "free plan: 200 calls a minute" },
};

const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
    <div className="flex flex-col gap-0.5" title={hint}>
        <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="text-lg font-semibold tabular-nums text-gray-100">{value}</dd>
    </div>
);

const ProviderCard = ({ usage, configured, now }: { usage: GateUsage; configured: boolean; now: number }) => {
    const label = PROVIDER_LABELS[usage.name] ?? { name: usage.name, limit: "" };
    const served = usage.memoryHits + usage.storeHits + usage.staleServed + usage.merged;
    const asked = served + usage.sent;
    const failures = Object.entries(usage.failures).filter(([, count]) => count);
    return (
        <section className="flex flex-col gap-4 rounded-xl border border-gray-600 bg-gray-800 p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-100">{label.name}</h2>
                <span className="text-xs text-gray-500">{configured ? `Key set · our budget ${usage.perMinute}/min (${label.limit})` : "No key set on the server"}</span>
            </header>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Calls, last minute" value={`${usage.lastMinute} / ${usage.perMinute}`} hint="Requests sent to the provider in the last 60 seconds, against our budget" />
                <Stat label="Calls, last hour" value={usage.lastHour} />
                <Stat label="Answered from cache" value={asked ? `${Math.round((served / asked) * 100)}%` : "—"} hint="Share of requests answered without calling the provider: cached, stored, or merged with a call already in flight" />
                <Stat label="Waiting now" value={usage.queued} hint="Requests queued for the budget" />
            </dl>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400 sm:grid-cols-3">
                <div><dt className="inline text-gray-500">Sent since start: </dt><dd className="inline tabular-nums">{usage.sent}</dd></div>
                <div><dt className="inline text-gray-500">Memory hits: </dt><dd className="inline tabular-nums">{usage.memoryHits}</dd></div>
                <div><dt className="inline text-gray-500">Database hits: </dt><dd className="inline tabular-nums">{usage.storeHits}</dd></div>
                <div><dt className="inline text-gray-500">Stale copies shown: </dt><dd className="inline tabular-nums">{usage.staleServed}</dd></div>
                <div><dt className="inline text-gray-500">Merged duplicates: </dt><dd className="inline tabular-nums">{usage.merged}</dd></div>
                <div><dt className="inline text-gray-500">Gave up waiting: </dt><dd className="inline tabular-nums">{usage.timedOut}</dd></div>
            </dl>
            {(failures.length > 0 || usage.pausedUntil) && (
                <div className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-400">
                    {usage.pausedUntil && <p className="font-medium text-gray-100">Paused after a rate-limit answer until {formatNewYorkMoment(usage.pausedUntil, now)}</p>}
                    {failures.length > 0 && <p>Failed calls: {failures.map(([issue, count]) => `${count} × ${ISSUE_WORDS[issue as keyof typeof ISSUE_WORDS] ?? issue}`).join("; ")}</p>}
                    {usage.lastError && <p>Last failure {formatNewYorkMoment(usage.lastError.at, now)}{usage.lastError.status ? ` (HTTP ${usage.lastError.status})` : ""}</p>}
                </div>
            )}
        </section>
    );
};

// How much of each provider's free-plan budget the app is using, and why anything failed. Counts cover this
// server process since it started; on Vercel each running instance keeps its own.
export default function StatusPage() {
    const { now, usage } = providerUsage();
    const hub = finnhubStreamHub();
    const configured: Record<string, boolean> = { finnhub: !!getFinnhubToken(), fred: !!getFredKey(), alpaca: alpacaConfigured() };

    return (
        <div className="flex flex-col gap-6">
            <BackToDashboard />
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">Data Status</h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                    Every market-data request goes through one budget per provider, set below its free-plan limit. Pages and tabs share the
                    answers, so opening more of them doesn&apos;t add requests. Counts since this server started {formatNewYorkMoment(processStartedAt(), now)}.
                </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {usage.map((entry) => (
                    <ProviderCard key={entry.name} usage={entry} configured={configured[entry.name] ?? false} now={now} />
                ))}
            </div>
            <section className="rounded-xl border border-gray-600 bg-gray-800 p-5 text-sm text-gray-400">
                <h2 className="text-lg font-semibold text-gray-100">Live trade stream</h2>
                <p className="mt-1">
                    {typeof hub === "string"
                        ? hub === "not-configured" ? "Off: no Finnhub key is set." : "Off: this Node version has no WebSocket (Node 22 or later is needed)."
                        : hub.streaming
                            ? `On: one Finnhub connection shared by ${hub.listenerCount} open ${hub.listenerCount === 1 ? "page" : "pages"}.`
                            : "Idle: it opens when a heatmap is on screen during market hours."}
                </p>
            </section>
            <p className="text-xs text-gray-500">
                AI is not used for prices, charts or calculations. Gemini only writes the welcome and daily news emails.
            </p>
        </div>
    );
}
