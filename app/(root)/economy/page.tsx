import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import FredKeyNotice from "@/components/economy/FredKeyNotice";
import IndicatorsBoard from "@/components/economy/IndicatorsBoard";
import { getIndicators } from "@/lib/indicator-data";
import { FRED_NOTICE } from "@/lib/indicators";
import { ISSUE_WORDS } from "@/lib/price-stamp";

export const metadata: Metadata = { title: "Economy · Loops Watch" };
export const dynamic = "force-dynamic";

const DESCRIPTION =
    "Rates, inflation, jobs and growth from FRED (Federal Reserve Bank of St. Louis), with each figure's period and when FRED last updated it. Figures are fetched at most every few hours; nothing refreshes in the background.";

// US economic indicators from FRED. The figures are cached on the server for hours (and in MongoDB), so a visit
// usually costs no FRED calls, and none from the Finnhub budget.
export default async function EconomyPage() {
    const payload = await getIndicators();

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title="Economy" description={DESCRIPTION} />
            {!payload.configured ? (
                <FredKeyNotice />
            ) : (
                <>
                    {payload.failed > 0 && (
                        <p role="status" className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm text-gray-400">
                            <span className="font-medium text-gray-100">
                                {payload.failed === payload.readings.length ? "No figures could be loaded" : `${payload.failed} of ${payload.readings.length} indicators couldn't be loaded`}
                            </span>
                            {payload.issue && `: ${ISSUE_WORDS[payload.issue]}`}. Missing figures show “—”; reload the page to try again.
                        </p>
                    )}
                    <IndicatorsBoard readings={payload.readings} now={payload.generatedAt} />
                </>
            )}
            <p className="text-xs text-gray-500">{FRED_NOTICE}</p>
        </div>
    );
}
