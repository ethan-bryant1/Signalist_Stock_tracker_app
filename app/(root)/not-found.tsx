import Link from "next/link";

export default function NotFound() {
    return (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-gray-600 bg-gray-800 p-6">
            <h1 className="text-xl font-semibold text-gray-100">Page not found</h1>
            <p className="text-sm text-gray-500">That address isn&apos;t part of Loops Watch.</p>
            <Link href="/" className="text-sm font-medium text-gray-100 hover:underline">
                Back to the dashboard
            </Link>
        </section>
    );
}
