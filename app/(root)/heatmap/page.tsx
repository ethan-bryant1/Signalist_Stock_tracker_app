import type { Metadata } from "next";
import BackToDashboard from "@/components/BackToDashboard";
import HeatmapTerminal from "@/components/HeatmapTerminal";
import IndexTiles from "@/components/IndexTiles";
import SectorPerformance from "@/components/SectorPerformance";
import { LiveMarketProvider } from "@/components/LiveMarket";
import { getMarketSnapshot } from "@/lib/actions/finnhub.actions";

export const metadata: Metadata = { title: "Stock Heatmap · Loops Watch" };

export default async function HeatmapPage() {
    const snapshot = await getMarketSnapshot(true);

    return (
        <LiveMarketProvider initial={snapshot} includeSectors>
            <div className="flex flex-col gap-6">
                <BackToDashboard />

                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">Stock Heatmap</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Every S&amp;P 500 company at a glance. Bigger blocks are bigger companies; green is up and red is down.
                    </p>
                </div>

                <IndexTiles />

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <HeatmapTerminal />
                    <SectorPerformance />
                </div>
            </div>
        </LiveMarketProvider>
    );
}
