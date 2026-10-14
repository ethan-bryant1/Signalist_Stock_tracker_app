import { headers } from "next/headers";
import { alpacaConfigured, getDailyHistory } from "@/lib/alpaca";
import { MAX_HOLDINGS } from "@/lib/backtest";
import { getSession } from "@/lib/better-auth/auth";
import type { BarsPayload } from "@/lib/portfolio";
import { issueOf } from "@/lib/providers/gate";
import { isListSymbol } from "@/lib/watchlists";

// Daily price history for the Portfolio page's backtests (?symbols=AAPL,SPY): each symbol's adjusted Alpaca daily
// opens and closes since 2016, from the shared cache (one Alpaca call per symbol a day at most). Only asked for when
// the page runs a backtest with symbols it hasn't loaded; there's no polling.

export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/portfolio/bars: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const payload: BarsPayload = { status: "ok", series: {}, failed: {} };
    const noStore = { headers: { "Cache-Control": "private, no-store" } };
    if (!alpacaConfigured()) return Response.json({ ...payload, status: "not-configured" }, noStore);

    const requested = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((symbol) => symbol.trim().toUpperCase());
    // The holdings plus a benchmark
    const symbols = [...new Set(requested.filter(isListSymbol))].slice(0, MAX_HOLDINGS + 1);
    await Promise.all(
        symbols.map(async (symbol) => {
            try {
                const history = await getDailyHistory(symbol);
                const { days, open, close } = history.bars;
                // No bars (an unknown symbol): left out, and the page says it has no daily prices
                if (!days.length) return;
                payload.series[symbol] = { days, open, close, skipped: history.skipped, fetchedAt: history.fetchedAt, stale: history.stale };
            } catch (e) {
                payload.failed[symbol] = issueOf(e);
            }
        })
    );
    return Response.json(payload, noStore);
}
