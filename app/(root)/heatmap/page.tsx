import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import BackToDashboard from "@/components/BackToDashboard";
import HeatmapWorkspace from "@/components/HeatmapWorkspace";
import { LiveMarketProvider } from "@/components/LiveMarket";
import { getMarketSnapshot } from "@/lib/actions/finnhub.actions";
import { getWatchlistSymbols } from "@/lib/actions/watchlist.actions";
import { getAuth } from "@/lib/better-auth/auth";
import { HEATMAP_LINK_VALUES, HEATMAP_SYMBOLS } from "@/lib/data/heatmap";
import { getHeatmapData } from "@/lib/heatmap-data";
import { parseHeatmapState } from "@/lib/heatmap-state";

export const metadata: Metadata = { title: "Stock Heatmap · Loops Watch" };

export default async function HeatmapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    // The layout checks the session too, but it renders alongside this page, so check before asking Finnhub for prices
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in");

    const params = await searchParams;
    const initialState = parseHeatmapState(
        { get: (name) => { const value = params[name]; return typeof value === "string" ? value : null; } },
        HEATMAP_LINK_VALUES
    );

    const [snapshot, heatmap, watchlist] = await Promise.all([
        getMarketSnapshot(true),
        getHeatmapData(),
        getWatchlistSymbols().catch(() => []),
    ]);

    return (
        <LiveMarketProvider initial={snapshot} includeSectors>
            <div className="flex flex-col gap-6">
                <BackToDashboard />

                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">Stock Heatmap</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Bigger blocks are bigger companies, and the color shows how far each one moved. The interactive map covers{" "}
                        {HEATMAP_SYMBOLS.length} large companies with live selection and sector focus; the Full S&amp;P 500 view shows
                        every company.
                    </p>
                </div>

                <HeatmapWorkspace initial={heatmap} initialState={initialState} watchlist={watchlist.map(({ symbol }) => symbol)} />
            </div>
        </LiveMarketProvider>
    );
}
