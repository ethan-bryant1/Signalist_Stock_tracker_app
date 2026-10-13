import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import WorkspaceApp from "@/components/workspace/WorkspaceApp";
import { IncludeSectorPrices } from "@/components/LiveMarket";
import { getSession } from "@/lib/better-auth/auth";
import { getWorkspaceStore } from "@/lib/actions/workspace.actions";
import { getMarketSnapshot } from "@/lib/stock-data";
import { defaultStore } from "@/lib/workspace";

export const metadata: Metadata = { title: "Workspace · Loops Watch" };

// Saved layouts of widgets, like IBKR Mosaic: Market Overview, Technical Analysis and Company Research to start,
// each changeable and saved to the account
export default async function WorkspacePage() {
    const session = await getSession(await headers());
    if (!session?.user) redirect("/sign-in");

    // The sector funds' prices come from the same shared cache as the header strip, for the Sector ETFs widget
    const [saved, snapshot] = await Promise.all([getWorkspaceStore(), getMarketSnapshot(true)]);
    const initialStore = saved && saved !== "unavailable" ? saved : defaultStore();
    const source = saved === "unavailable" ? "unavailable" : saved ? "account" : "default";

    return (
        <IncludeSectorPrices initial={snapshot}>
            <div className="flex flex-col gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">Workspace</h1>
                    <p className="mt-1 max-w-3xl text-sm text-gray-500">
                        Your own arrangements of charts, quotes, news and market panels. Switch workspaces with the tabs, load a symbol into every
                        linked widget, and choose Edit layout to add, drag and resize widgets.
                    </p>
                </div>
                <WorkspaceApp initialStore={initialStore} source={source} />
            </div>
        </IncludeSectorPrices>
    );
}
