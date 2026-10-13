'use client';

import { useId, useState } from "react";
import { isWorkspaceSymbol, normalizeSymbol } from "@/lib/workspace";
import { cn } from "@/lib/utils";

// A ticker box: type a symbol (or EXCHANGE:SYMBOL) and press Enter. Shows a short error for anything that isn't a ticker.
const SymbolField = ({ label, value, onCommit, compact = false }: { label: string; value: string; onCommit: (symbol: string) => void; compact?: boolean }) => {
    const id = useId();
    const [draft, setDraft] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const shown = draft ?? value;

    const commit = () => {
        if (draft === null) return;
        const symbol = normalizeSymbol(draft);
        if (!isWorkspaceSymbol(symbol)) {
            setError(true);
            return;
        }
        setError(false);
        setDraft(null);
        if (symbol !== value) onCommit(symbol);
    };

    return (
        <div className={cn("ws-no-drag flex items-center gap-2", compact && "gap-1.5")}>
            <label htmlFor={id} className={cn("text-[11px] font-medium uppercase tracking-wider text-gray-500", compact && "sr-only")}>
                {label}
            </label>
            <input
                id={id}
                value={shown}
                onChange={(event) => {
                    setDraft(event.target.value.toUpperCase());
                    setError(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") commit();
                    if (event.key === "Escape") {
                        setDraft(null);
                        setError(false);
                    }
                }}
                onBlur={() => {
                    setDraft(null);
                    setError(false);
                }}
                spellCheck={false}
                autoComplete="off"
                maxLength={20}
                aria-invalid={error || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                    "rounded-md border bg-gray-900 font-semibold uppercase tabular-nums text-gray-100 outline-none transition-colors focus:border-gray-400",
                    error ? "border-gray-100" : "border-gray-600",
                    compact ? "h-6 w-20 px-1.5 text-[11px]" : "h-8 w-28 px-2 text-sm"
                )}
            />
            {error && (
                <span id={`${id}-error`} role="alert" className="text-[11px] font-medium text-gray-100">
                    Not a ticker
                </span>
            )}
        </div>
    );
};

export default SymbolField;
