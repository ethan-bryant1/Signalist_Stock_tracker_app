import { headers } from "next/headers";
import { getAuth } from "@/lib/better-auth/auth";
import { getHeatmapData } from "@/lib/heatmap-data";

// The interactive heatmaps poll this for fresh prices. A plain GET (not a Server Action) so polling never queues
// behind other actions on the page and keeps working across redeploys. Signed-in viewers only: an empty cache
// costs over 100 Finnhub requests, so strangers can't trigger it.
export async function GET() {
    try {
        const auth = await getAuth();
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) return Response.json({ error: "signed-out" }, { status: 401 });
    } catch (e) {
        console.error("GET /api/heatmap: couldn't check the session", e);
        return Response.json({ error: "session-check-failed" }, { status: 503 });
    }

    const payload = await getHeatmapData();
    // The data cache on the server already shares prices between viewers; browsers shouldn't keep their own copy
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
