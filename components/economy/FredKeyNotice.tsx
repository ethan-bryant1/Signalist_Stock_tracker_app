import { KeyRound } from "lucide-react";

// Shown instead of figures while no FRED key is set on the server. No sample or placeholder numbers.
const FredKeyNotice = ({ compact = false }: { compact?: boolean }) => (
    <div role="status" className={compact ? "flex flex-col gap-2 px-4 py-3 text-sm" : "flex flex-col items-start gap-4 rounded-xl border border-gray-600 bg-gray-800 p-6"}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-100">
            <KeyRound aria-hidden className="h-4 w-4" />
            Add a free FRED key to see economic indicators
        </h2>
        <p className="max-w-2xl text-sm text-gray-500">
            The figures come from FRED, the St. Louis Fed&apos;s free data service. It needs your own API key, which costs nothing. Nothing is shown until the key is set: the app never fills in sample numbers.
        </p>
        {!compact && (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-gray-400">
                <li>
                    Create a free FRED account and request an API key at{" "}
                    <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener noreferrer" className="font-medium text-gray-100 underline underline-offset-2">
                        fred.stlouisfed.org/docs/api/api_key.html
                    </a>
                    .
                </li>
                <li>
                    Add a line <code className="rounded bg-gray-700 px-1.5 py-0.5 text-[13px] text-gray-100">FRED_API_KEY=your-key</code> to the <code className="rounded bg-gray-700 px-1.5 py-0.5 text-[13px] text-gray-100">.env</code> file (and to Vercel&apos;s environment variables once deployed).
                </li>
                <li>Stop the dev server and start it again so it reads the new key.</li>
            </ol>
        )}
    </div>
);

export default FredKeyNotice;
