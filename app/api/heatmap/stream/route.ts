import { headers } from "next/headers";
import { getSession } from "@/lib/better-auth/auth";
import { finnhubStreamHub } from "@/lib/finnhub-stream";
import { getHeatmapData } from "@/lib/heatmap-data";
import { pickStreamSymbols } from "@/lib/live-trades";

// Live prices for the interactive heatmaps. The server holds Finnhub's trade stream (its key never reaches the
// browser) and passes the trades on to the page as server-sent events:
//   event: live      {"symbols": [...]}   the stream is open, with the symbols it covers
//   event: trades    [{"symbol","price","time","session"}, ...]   the newest trade per symbol and session since the
//                    last batch (session is "regular", "pre-market" or "post-market")
//   event: reconnect {}                   this connection is ending on schedule; open a new one straight away
//   event: closed    {"reason": "..."}    the stream stopped (no key, Finnhub refused it or dropped it)
// Every open tab shares the server's one Finnhub socket (lib/finnhub-stream.ts), since Finnhub allows one per key.
// Each connection lasts a few minutes, inside the hosting platform's time limit for one request, and the page opens
// the next one. Signed-in viewers only.

export const dynamic = "force-dynamic";
// Vercel's limit for one request on its free plan (with Fluid compute). The stream ends a little before it.
export const maxDuration = 300;
const STREAM_MS = 280_000;
// A comment line now and then keeps proxies from closing a quiet connection
const KEEPALIVE_MS = 15_000;

export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/heatmap/stream: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const hub = finnhubStreamHub();
    // The largest stocks on the map, up to the free plan's limit (from the shared, cached map data)
    const symbols = typeof hub === "string" ? [] : pickStreamSymbols((await getHeatmapData()).stocks);
    const wanted = new Set(symbols);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let finished = false;
            const timers: ReturnType<typeof setTimeout>[] = [];
            let leave = () => {};

            const write = (text: string) => {
                if (finished) return;
                try {
                    controller.enqueue(encoder.encode(text));
                } catch {
                    finish();
                }
            };
            const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

            function finish(event?: { name: string; data: unknown }) {
                if (finished) return;
                if (event) send(event.name, event.data);
                finished = true;
                timers.forEach((timer) => clearInterval(timer));
                request.signal.removeEventListener("abort", onAbort);
                leave();
                try {
                    controller.close();
                } catch {}
            }
            const onAbort = () => finish();

            if (typeof hub === "string") return finish({ name: "closed", data: { reason: hub } });

            request.signal.addEventListener("abort", onAbort);
            leave = hub.join(
                {
                    onLive: (live) => send("live", { symbols: live.filter((symbol) => wanted.has(symbol)) }),
                    onTrades: (trades) => {
                        const mine = trades.filter((trade) => wanted.has(trade.symbol));
                        if (mine.length) send("trades", mine);
                    },
                    onClosed: (reason) => {
                        if (reason === "refused") console.error("GET /api/heatmap/stream: Finnhub refused the stream");
                        finish({ name: "closed", data: { reason } });
                    },
                },
                symbols
            );

            timers.push(setInterval(() => write(": keepalive\n\n"), KEEPALIVE_MS));
            timers.push(setTimeout(() => finish({ name: "reconnect", data: {} }), STREAM_MS));
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
