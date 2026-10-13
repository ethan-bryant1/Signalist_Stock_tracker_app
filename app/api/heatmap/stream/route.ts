import { headers } from "next/headers";
import { getSession } from "@/lib/better-auth/auth";
import { FINNHUB_STREAM_URL, getFinnhubToken } from "@/lib/finnhub";
import { getHeatmapData } from "@/lib/heatmap-data";
import { latestTrades, pickStreamSymbols, type LiveTrade } from "@/lib/live-trades";

// Live prices for the interactive heatmaps. The server holds Finnhub's trade stream (its key never reaches the
// browser) and passes the trades on to the page as server-sent events:
//   event: live      {"symbols": [...]}   the stream is open, with the symbols it covers
//   event: trades    [{"symbol","price","time","session"}, ...]   the newest trade per symbol and session since the
//                    last batch (session is "regular", "pre-market" or "post-market")
//   event: reconnect {}                   this connection is ending on schedule; open a new one straight away
//   event: closed    {"reason": "..."}    the stream stopped (no key, Finnhub refused it or dropped it)
// Each connection lasts a few minutes, inside the hosting platform's time limit for one request, and the page opens
// the next one. Signed-in viewers only.

export const dynamic = "force-dynamic";
// Vercel's limit for one request on its free plan (with Fluid compute). The stream ends a little before it.
export const maxDuration = 300;
const STREAM_MS = 280_000;
// Trades are passed on in batches, at most this often, with only each stock's newest price: the busiest stocks
// trade hundreds of times a second, more than a map can show
const BATCH_MS = 500;
// A comment line now and then keeps proxies from closing a quiet connection
const KEEPALIVE_MS = 15_000;

type CloseReason = "not-configured" | "unsupported" | "refused" | "dropped";

export async function GET(request: Request) {
    try {
        const session = await getSession(await headers());
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/heatmap/stream: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const token = getFinnhubToken();
    // Node 22 and later have WebSocket built in; older versions can't open the stream, and the page keeps its
    // once-a-minute refresh
    const closeReason: CloseReason | undefined = !token ? "not-configured" : typeof WebSocket === "undefined" ? "unsupported" : undefined;

    // The largest stocks on the map, up to the free plan's limit (from the shared, cached map data)
    const symbols = closeReason ? [] : pickStreamSymbols((await getHeatmapData()).stocks);
    const wanted = new Set(symbols);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let finished = false;
            const pending = new Map<string, LiveTrade>();
            // The socket to Finnhub, once there is one
            const finnhub: { socket?: WebSocket } = {};
            const timers: ReturnType<typeof setTimeout>[] = [];

            const write = (text: string) => {
                if (finished) return;
                try {
                    controller.enqueue(encoder.encode(text));
                } catch {
                    finish();
                }
            };
            const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

            const flush = () => {
                if (!pending.size) return;
                send("trades", [...pending.values()]);
                pending.clear();
            };

            function finish(event?: { name: string; data: unknown }) {
                if (finished) return;
                flush();
                if (event) send(event.name, event.data);
                finished = true;
                timers.forEach((timer) => clearInterval(timer));
                request.signal.removeEventListener("abort", onAbort);
                if (finnhub.socket && finnhub.socket.readyState <= WebSocket.OPEN) finnhub.socket.close();
                try {
                    controller.close();
                } catch {}
            }
            const onAbort = () => finish();

            if (closeReason) return finish({ name: "closed", data: { reason: closeReason } });

            request.signal.addEventListener("abort", onAbort);
            // The URL carries the key, so it's never logged
            const socket = new WebSocket(`${FINNHUB_STREAM_URL}?token=${encodeURIComponent(token!)}`);
            finnhub.socket = socket;
            let opened = false;

            socket.onopen = () => {
                opened = true;
                for (const symbol of symbols) socket.send(JSON.stringify({ type: "subscribe", symbol }));
                send("live", { symbols });
            };
            socket.onmessage = (message) => {
                let data: unknown;
                try {
                    data = JSON.parse(typeof message.data === "string" ? message.data : "");
                } catch {
                    return;
                }
                if ((data as { type?: unknown })?.type === "error") {
                    console.error("GET /api/heatmap/stream: Finnhub refused the stream");
                    return finish({ name: "closed", data: { reason: "refused" } });
                }
                for (const trade of latestTrades(data, wanted)) {
                    const key = `${trade.symbol} ${trade.session}`;
                    const seen = pending.get(key);
                    if (!seen || trade.time >= seen.time) pending.set(key, trade);
                }
            };
            // Finnhub turns away a wrong key or too many connections by closing (or failing) the socket
            socket.onerror = () => finish({ name: "closed", data: { reason: opened ? "dropped" : "refused" } });
            socket.onclose = () => finish({ name: "closed", data: { reason: opened ? "dropped" : "refused" } });

            timers.push(setInterval(flush, BATCH_MS));
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
