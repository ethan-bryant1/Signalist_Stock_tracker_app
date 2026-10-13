import { headers } from "next/headers";
import { getSession } from "@/lib/better-auth/auth";
import { MAX_ROWS_PER_REQUEST, getWatchFigures, getWatchRows } from "@/lib/watchlist-data";
import { isListSymbol } from "@/lib/watchlists";

// The watchlist grid's figures for the symbols asked for (?symbols=AAPL,NVDA), from the shared cache and call budget.
// ?part=figures sends only the key figures, for rows whose price is already there.
// The page asks only for symbols it hasn't loaded yet or that are still waiting; there's no polling. A route rather
// than a server action, so a slow load never holds up saving a change to the lists.
export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/watchlist/rows: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const requested = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((symbol) => symbol.trim().toUpperCase());
    const symbols = [...new Set(requested.filter(isListSymbol))].slice(0, MAX_ROWS_PER_REQUEST);
    const figuresOnly = new URL(request.url).searchParams.get("part") === "figures";
    if (symbols.length === 0) return Response.json(figuresOnly ? { figures: [] } : { rows: [] });
    if (figuresOnly) return Response.json({ figures: await getWatchFigures(symbols) }, { headers: { "Cache-Control": "private, no-store" } });
    const rows = await getWatchRows(symbols);
    return Response.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
}
