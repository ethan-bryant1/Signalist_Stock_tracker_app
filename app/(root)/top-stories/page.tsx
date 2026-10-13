import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import NewsCenter from "@/components/news/NewsCenter";
import { getSession } from "@/lib/better-auth/auth";
import { DEFAULT_NEWS_PREFS, type NewsPrefs, type SavedArticle } from "@/lib/news";
import { getMarketNews } from "@/lib/news-data";
import { loadNewsPrefs } from "@/lib/news-store";
import { loadWatchlists } from "@/lib/watchlist-store";
import { allSymbols } from "@/lib/watchlists";

export const metadata: Metadata = { title: "News · Loops Watch" };

// Market, M&A and watchlist headlines with the earnings calendar (Finnhub, through the shared cache), beside
// TradingView's economic calendar. The URL stays /top-stories so links and bookmarks keep working.
export default async function NewsPage() {
    const session = await getSession(await headers());
    if (!session?.user) redirect("/sign-in");
    const userId = session.user.id;

    const [market, lists, stored] = await Promise.all([
        getMarketNews(),
        loadWatchlists(userId).catch((e) => {
            console.error("News page: couldn't read the watchlists", e);
            return null;
        }),
        loadNewsPrefs(userId).catch((e) => {
            console.error("News page: couldn't read the news settings", e);
            return null;
        }),
    ]);
    const prefs: NewsPrefs = stored?.prefs ?? DEFAULT_NEWS_PREFS;
    const saved: SavedArticle[] = stored?.saved ?? [];

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="News & Intelligence"
                description="Market headlines, company news for your watchlists, earnings reports and the economic calendar. Headlines and earnings from Finnhub; economic events from TradingView."
            />
            <NewsCenter
                initialMarket={market}
                watchlistSymbols={lists ? allSymbols(lists) : []}
                initialPrefs={prefs}
                initialSaved={saved}
                prefsUnavailable={stored === null}
                renderedAt={market.checkedAt}
            />
        </div>
    );
}
