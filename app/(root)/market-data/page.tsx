import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import MarketDataExplorer from "@/components/MarketDataExplorer";
import { MARKET_SECTORS, type MarketSector } from "@/lib/data/sp500";

export const metadata: Metadata = { title: "Markets · Loops Watch" };

// ?sector=Energy opens the page with that sector already picked (the heatmap's sector list links here)
export default async function MarketDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { sector } = await searchParams;
    const initialSector = MARKET_SECTORS.find(({ value }) => value === sector)?.value as MarketSector | undefined;

    return (
        <div className="flex min-h-screen flex-col gap-6">
            <PageHeader title="Markets" description="TradingView's screener of every US-listed stock, or quotes for an S&P 500 sector or search. TradingView's data, which may be delayed." />
            <MarketDataExplorer initialSector={initialSector} />
        </div>
    );
}
