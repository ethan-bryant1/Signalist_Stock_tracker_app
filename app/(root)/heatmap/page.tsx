import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import BackToDashboard from "@/components/BackToDashboard";
import SP500Heatmap from "@/components/SP500Heatmap";
import { IncludeSectorPrices } from "@/components/LiveMarket";
import { getMarketSnapshot } from "@/lib/stock-data";
import { getSession } from "@/lib/better-auth/auth";
import { parseHeatmapState } from "@/lib/heatmap-state";

export const metadata: Metadata = { title: "S&P 500 Heatmap · Loops Watch" };

// TradingView's full S&P 500 map. The dashboard's Market Snapshot is our own map of the largest companies; this page
// is for exploring the whole index, so it asks Finnhub only for the sector funds' prices.
export default async function HeatmapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    // The layout checks the session too, but it renders alongside this page, so check before asking Finnhub for prices
    const session = await getSession(await headers());
    if (!session?.user) redirect("/sign-in");

    const params = await searchParams;
    const initialState = parseHeatmapState({ get: (name) => { const value = params[name]; return typeof value === "string" ? value : null; } });
    const snapshot = await getMarketSnapshot(true);

    return (
        <IncludeSectorPrices initial={snapshot}>
            <div className="flex flex-col gap-6">
                <BackToDashboard />

                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">S&amp;P 500 Heatmap</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Every S&amp;P 500 company: bigger blocks are bigger companies, and the color shows how far each one moved. Click a
                        stock for its Loops Watch page.
                    </p>
                </div>

                <SP500Heatmap initialState={initialState} initialNow={snapshot.checkedAt} />
            </div>
        </IncludeSectorPrices>
    );
}
