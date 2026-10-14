// Shown while the server gathers the indicators (only slow the first time; after that they're cached)
export default function EconomyLoading() {
    return (
        <div aria-busy="true" aria-label="Loading economic indicators" className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
                <div className="h-5 w-36 animate-pulse rounded bg-gray-800" />
                <div className="h-8 w-40 animate-pulse rounded bg-gray-800" />
                <div className="h-4 w-full max-w-xl animate-pulse rounded bg-gray-800" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="h-96 animate-pulse rounded-xl border border-gray-600 bg-gray-800 xl:order-last" />
                <div className="overflow-hidden rounded-xl border border-gray-600 bg-gray-800 xl:col-span-2">
                    {Array.from({ length: 10 }, (_, index) => (
                        <div key={index} className="flex h-12 items-center gap-6 border-b border-gray-700/70 px-4">
                            <span className="h-2.5 w-40 animate-pulse rounded bg-gray-700" />
                            <span className="ml-auto h-2.5 w-16 animate-pulse rounded bg-gray-700" />
                            <span className="h-2.5 w-16 animate-pulse rounded bg-gray-700" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
