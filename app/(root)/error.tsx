'use client';

import Link from "next/link";

// Shown when a page fails to load (a provider or database error that wasn't handled), instead of Next's default
// screen. The header and market strip stay in place around it.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-gray-600 bg-gray-800 p-6">
            <h1 className="text-xl font-semibold text-gray-100">This page couldn&apos;t load</h1>
            <p className="max-w-xl text-sm text-gray-500">
                A data provider or the database didn&apos;t answer. Nothing was changed. Try again, or check Data status to see whether a
                provider is limiting requests.
            </p>
            <div className="flex gap-3 text-sm font-medium">
                <button type="button" onClick={reset} className="cursor-pointer rounded-md border border-gray-500 px-3 py-1.5 text-gray-100 hover:bg-gray-700">
                    Try again
                </button>
                <Link href="/status" className="rounded-md px-3 py-1.5 text-gray-400 hover:text-gray-100">
                    Data status
                </Link>
            </div>
        </section>
    );
}
