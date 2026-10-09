import WatchlistTable from "@/components/WatchlistTable";
import OpenSearchButton from "@/components/OpenSearchButton";
import { getWatchlistWithData } from "@/lib/actions/watchlist.actions";

export default async function WatchlistPage() {
  const watchlist = await getWatchlistWithData();

  if (watchlist.length === 0) {
    return (
      <section className="watchlist-empty-container flex">
        <div className="watchlist-empty">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="watchlist-star"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557L3.04 10.385a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z"
            />
          </svg>
          <h2 className="empty-title">Your watchlist is empty</h2>
          <p className="empty-description">
            Search for a stock and press &quot;Add to Watchlist&quot; on its page to start tracking it here.
          </p>
          <OpenSearchButton label="Search stocks" />
        </div>
      </section>
    );
  }

  return (
    <section className="watchlist space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="watchlist-title">Watchlist</h2>
        <OpenSearchButton label="Add stock" />
      </div>
      <WatchlistTable watchlist={watchlist} />
    </section>
  );
}
