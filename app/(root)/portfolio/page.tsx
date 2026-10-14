import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import PortfolioApp from "@/components/portfolio/PortfolioApp";
import { getPortfolios } from "@/lib/actions/portfolio.actions";
import { getWatchlists } from "@/lib/actions/watchlist.actions";
import { alpacaConfigured } from "@/lib/alpaca";
import { getSession } from "@/lib/better-auth/auth";
import { emptyPortfolioDoc } from "@/lib/portfolio";

export const metadata: Metadata = { title: "Portfolio · Loops Watch" };

// Portfolios of symbols with target weights, backtested on daily prices against a benchmark. The page sends no
// prices; the browser asks /api/portfolio/bars for the holdings' history and runs the backtest itself.
export default async function PortfolioPage() {
    const session = await getSession(await headers());
    if (!session?.user) redirect("/sign-in");

    const [saved, watchlists] = await Promise.all([getPortfolios(), getWatchlists()]);
    const initial = saved && saved !== "unavailable" ? saved : emptyPortfolioDoc(crypto.randomUUID().slice(0, 12));

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Portfolio"
                description="Backtest a portfolio of stocks and funds on daily prices since 2016: target weights, rebalancing, costs and an optional trend filter, against a benchmark, with a held-out period to check the result."
            />
            <PortfolioApp
                initial={initial}
                saving={saved === "unavailable" ? "unavailable" : "account"}
                userId={session.user.id}
                configured={alpacaConfigured()}
                watchlists={(watchlists?.lists ?? []).map((list) => ({ id: list.id, name: list.name, symbols: list.items.map((item) => item.symbol) }))}
            />
        </div>
    );
}
