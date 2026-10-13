// Shown while the server loads the lists and the first prices: the page's frame with placeholder rows
export default function WatchlistLoading() {
  return (
    <section aria-busy="true" aria-label="Loading watchlists" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="h-5 w-36 animate-pulse rounded bg-gray-800" />
        <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-gray-800" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-[52px] w-72 animate-pulse rounded-lg bg-gray-800" />
        <div className="h-12 animate-pulse rounded-xl border border-gray-600 bg-gray-800" />
        <div className="overflow-hidden rounded-xl border border-gray-600 bg-gray-800">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex h-8 items-center gap-6 border-b border-gray-700/70 px-3">
              <span className="h-2.5 w-12 animate-pulse rounded bg-gray-700" />
              <span className="h-2.5 w-40 animate-pulse rounded bg-gray-700" />
              <span className="ml-auto h-2.5 w-16 animate-pulse rounded bg-gray-700" />
              <span className="h-2.5 w-16 animate-pulse rounded bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
