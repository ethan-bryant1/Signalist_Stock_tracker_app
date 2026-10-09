import BackToDashboard from "@/components/BackToDashboard";
import MarketDataExplorer from "@/components/MarketDataExplorer";
import { MARKET_SECTORS, type MarketSector } from "@/lib/data/sp500";

// ?sector=Energy opens the page with that sector already picked (the heatmap's sector list links here)
export default async function MarketDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { sector } = await searchParams;
    const initialSector = MARKET_SECTORS.find(({ value }) => value === sector)?.value as MarketSector | undefined;

    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <h1 className="font-semibold text-2xl text-gray-100">Market Data</h1>
            <MarketDataExplorer initialSector={initialSector} />
        </div>
    );
}
