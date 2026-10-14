import { headers } from "next/headers";
import { alpacaConfigured, getDailyHistory } from "@/lib/alpaca";
import { getSession } from "@/lib/better-auth/auth";
import type { ChartPayload } from "@/lib/price-chart";
import { issueOf } from "@/lib/providers/gate";
import { isListSymbol } from "@/lib/watchlists";

// One symbol's adjusted Alpaca daily bars since 2016 for the stock page's daily chart (?symbol=AAPL). The same cached
// copy the Portfolio page backtests on (lib/alpaca.ts), so a symbol costs one Alpaca call a day at most. Only asked
// for when the chart is opened; there's no polling.

export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/chart: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const noStore = { headers: { "Cache-Control": "private, no-store" } };
    const reply = (payload: ChartPayload) => Response.json(payload, noStore);
    const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
    if (!isListSymbol(symbol)) return Response.json({ error: "bad-symbol" }, { status: 400 });
    if (!alpacaConfigured()) return reply({ status: "not-configured" });

    try {
        const history = await getDailyHistory(symbol);
        if (!history.bars.days.length) return reply({ status: "no-bars", symbol });
        return reply({ status: "ok", symbol, bars: history.bars, skipped: history.skipped, fetchedAt: history.fetchedAt, stale: history.stale });
    } catch (e) {
        return reply({ status: "failed", issue: issueOf(e) });
    }
}
