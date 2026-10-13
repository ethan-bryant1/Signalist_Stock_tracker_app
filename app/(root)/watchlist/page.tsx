import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import RetryButton from "@/components/watchlist/RetryButton";
import WatchlistApp from "@/components/watchlist/WatchlistApp";
import { getWatchlists } from "@/lib/actions/watchlist.actions";
import { getWatchRows } from "@/lib/watchlist-data";
import { activeList } from "@/lib/watchlists";

export const metadata: Metadata = { title: "Watchlist · Loops Watch" };

// The first rows come with the page so a short list shows prices at once; a longer list fills in from the browser
const FIRST_ROWS = 10;
const DESCRIPTION = "Your lists of stocks and funds with Finnhub figures. Each price shows its time; pick a row for its details or open its full page.";

export default async function WatchlistPage() {
  const doc = await getWatchlists();

  if (doc === null) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader title="Watchlists" description={DESCRIPTION} />
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-gray-600 bg-gray-800 p-6">
          <h2 className="text-base font-semibold text-gray-100">Couldn&apos;t load your watchlists</h2>
          <p className="text-sm text-gray-500">The database didn&apos;t answer. Your lists are safe; try again in a moment.</p>
          <RetryButton />
        </div>
      </section>
    );
  }

  const initialRows = await getWatchRows(activeList(doc).items.slice(0, FIRST_ROWS).map((item) => item.symbol));

  return (
    <section>
      <WatchlistApp initial={doc} initialRows={initialRows} description={DESCRIPTION} />
    </section>
  );
}
