import type { Metadata } from "next";
import MarketsApp from "@/components/markets/MarketsApp";
import { getMarketsPrefs } from "@/lib/actions/markets.actions";
import { getWatchlists } from "@/lib/actions/watchlist.actions";
import { DEFAULT_PREFS, DEFAULT_STATE, stateFromParams } from "@/lib/screener";

export const metadata: Metadata = { title: "Markets · Loops Watch" };

// The screen comes from the address when it has one (a bookmark, Back from a stock page, or the dashboard's
// ?sector= links), otherwise the last one used. No market data is fetched here: TradingView's screener loads its
// own, and the native table asks for Finnhub figures from the browser through the shared cache.
export default async function MarketDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const [params, prefs, watchlists] = await Promise.all([searchParams, getMarketsPrefs(), getWatchlists()]);
    const saved = prefs === "unavailable" ? null : prefs;
    const base = saved?.last ?? DEFAULT_STATE;
    let initialState = stateFromParams(params, base) ?? base;
    // A watchlist screen needs the lists; without them, fall back to the S&P 500 list
    if (initialState.universe === "watchlist" && !watchlists) initialState = { ...initialState, universe: "sp500" };

    return <MarketsApp initialState={initialState} initialPrefs={saved ?? DEFAULT_PREFS} prefsAvailable={!!saved} watchlists={watchlists} />;
}
