import BackToDashboard from "@/components/BackToDashboard";
import MarketDataExplorer from "@/components/MarketDataExplorer";

export default function MarketDataPage() {
    return (
        <div className="flex min-h-screen flex-col gap-6">
            <BackToDashboard />
            <h1 className="font-semibold text-2xl text-gray-100">Market Data</h1>
            <MarketDataExplorer />
        </div>
    );
}
