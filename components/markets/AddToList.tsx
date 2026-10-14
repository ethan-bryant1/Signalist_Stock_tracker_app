"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { addWatchlistSymbol } from "@/lib/actions/watchlist.actions";
import type { WatchlistDoc } from "@/lib/watchlists";

// Adds the selected stock to one of the user's watchlists (the open one first). Saved with the account; the
// Watchlist page shows it next time it loads.
const AddToList = ({ symbol, company, doc, onSaved }: { symbol: string; company: string; doc: WatchlistDoc; onSaved: (doc: WatchlistDoc) => void }) => {
    const ids = useId();
    const [listId, setListId] = useState(doc.activeId);
    const [saving, setSaving] = useState(false);
    const list = doc.lists.find((entry) => entry.id === listId) ?? doc.lists[0];
    const inList = list.items.some((item) => item.symbol === symbol);

    const add = async () => {
        if (saving || inList) return;
        setSaving(true);
        const result = await addWatchlistSymbol(list.id, symbol, company).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
        setSaving(false);
        if (!result.ok) return void toast.error(result.error);
        onSaved(result.doc);
        toast.success(`Added ${symbol} to ${list.name}`);
    };

    return (
        <div className="flex min-w-0 items-center gap-1">
            {doc.lists.length > 1 && (
                <>
                    <label htmlFor={`${ids}-list`} className="sr-only">
                        Watchlist
                    </label>
                    <select id={`${ids}-list`} value={list.id} onChange={(event) => setListId(event.target.value)} className="h-8 max-w-32 min-w-0 rounded-lg border border-gray-600 bg-gray-900 px-1.5 text-xs text-gray-100">
                        {doc.lists.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.name}
                            </option>
                        ))}
                    </select>
                </>
            )}
            <button
                type="button"
                onClick={() => void add()}
                aria-disabled={saving || inList || undefined}
                title={inList ? `${symbol} is in ${list.name}` : `Add ${symbol} to ${list.name}`}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 hover:text-gray-100 aria-disabled:cursor-default aria-disabled:hover:text-gray-400"
            >
                {inList ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
                {inList ? `In ${doc.lists.length > 1 ? "list" : list.name}` : saving ? "Adding…" : doc.lists.length > 1 ? "Add" : "Add to watchlist"}
            </button>
        </div>
    );
};

export default AddToList;
