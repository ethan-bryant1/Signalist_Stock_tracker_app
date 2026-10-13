import { headers } from "next/headers";
import { getSession } from "@/lib/better-auth/auth";
import { getMarketSnapshot } from "@/lib/stock-data";

// The index, gold, oil and bond fund prices (and the sector funds with ?sectors=1) that the header strip and the
// dashboard refresh every minute. Signed-in viewers only, so nobody else can spend the Finnhub budget.
export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/market: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const includeSectors = new URL(request.url).searchParams.get("sectors") === "1";
    const snapshot = await getMarketSnapshot(includeSectors);
    return Response.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
