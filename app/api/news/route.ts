import { headers } from "next/headers";
import { getSession } from "@/lib/better-auth/auth";
import { getUpcomingEvents } from "@/lib/events-data";
import { getEarnings, getMarketNews, getWatchlistNews, WATCHLIST_NEWS_CHUNK } from "@/lib/news-data";
import { isListSymbol } from "@/lib/watchlists";

// The News page's feeds, for signed-in users only (each answer can spend Finnhub's budget on a cold cache):
//   ?feed=market                        market and M&A headlines
//   ?feed=watchlist&symbols=AAPL,NVDA   recent company news for up to 12 symbols
//   ?feed=earnings&symbols=AAPL,NVDA    the earnings calendar for the S&P 500 plus these symbols
//   ?feed=events                        upcoming Fed and economic-data events (free agency schedules, no Finnhub calls)
// Everything comes from the shared server cache; the page asks again only on its 15-minute refresh or a click.
export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/news: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const params = new URL(request.url).searchParams;
    const feed = params.get("feed");
    const symbols = [...new Set((params.get("symbols") ?? "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(isListSymbol))];
    const noStore = { headers: { "Cache-Control": "private, no-store" } };

    if (feed === "market") return Response.json(await getMarketNews(), noStore);
    if (feed === "watchlist") {
        if (symbols.length > WATCHLIST_NEWS_CHUNK) return Response.json({ error: "too-many-symbols" }, { status: 400 });
        return Response.json(await getWatchlistNews(symbols), noStore);
    }
    if (feed === "events") return Response.json(await getUpcomingEvents(), noStore);
    if (feed === "earnings") return Response.json(await getEarnings(symbols.slice(0, 500)), noStore);
    return Response.json({ error: "unknown-feed" }, { status: 400 });
}
