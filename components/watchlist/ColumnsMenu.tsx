"use client";

import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLUMN_KEYS, COLUMNS, DEFAULT_PREFS, moveColumn, toggleColumn, type Density, type WatchlistPrefs } from "@/lib/watchlists";
import { cn } from "@/lib/utils";

const smallButton =
    "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-30";

// Which columns the grid shows and in what order, row height and the details panel. Saved with the account.
const ColumnsMenu = ({ prefs, onChange, showPanelToggle = true }: { prefs: WatchlistPrefs; onChange: (prefs: WatchlistPrefs) => void; showPanelToggle?: boolean }) => {
    const shown = prefs.columns;
    const hidden = COLUMN_KEYS.filter((key) => !shown.includes(key));
    const set = (patch: Partial<WatchlistPrefs>) => onChange({ ...prefs, ...patch });

    return (
        <Popover>
            <PopoverTrigger
                title="Choose columns, row height and the details panel"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100"
            >
                <Columns3 aria-hidden className="h-3.5 w-3.5" />
                Columns
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[min(36rem,80vh)] w-80 overflow-y-auto border border-gray-600 bg-gray-800 p-3 text-gray-100">
                <fieldset>
                    <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Shown, in order</legend>
                    <ul className="flex flex-col">
                        {shown.map((key, index) => (
                            <li key={key} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-700/40">
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                                    <input type="checkbox" checked onChange={() => set({ columns: toggleColumn(shown, key) })} className="h-3.5 w-3.5 accent-gray-100" />
                                    <span className="truncate">{COLUMNS[key].label}</span>
                                    {COLUMNS[key].stockOnly && <span className="text-[10px] text-gray-500">stocks</span>}
                                </label>
                                <button type="button" disabled={index === 0} onClick={() => set({ columns: moveColumn(shown, key, -1) })} aria-label={`Move ${COLUMNS[key].label} left`} title="Move left" className={smallButton}>
                                    <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" disabled={index === shown.length - 1} onClick={() => set({ columns: moveColumn(shown, key, 1) })} aria-label={`Move ${COLUMNS[key].label} right`} title="Move right" className={smallButton}>
                                    <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </fieldset>
                {hidden.length > 0 && (
                    <fieldset className="mt-3">
                        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">More columns</legend>
                        <ul className="flex flex-col">
                            {hidden.map((key) => (
                                <li key={key} className="rounded px-1 py-0.5 hover:bg-gray-700/40">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-400">
                                        <input type="checkbox" checked={false} onChange={() => set({ columns: toggleColumn(shown, key) })} className="h-3.5 w-3.5 accent-gray-100" />
                                        <span className="truncate">{COLUMNS[key].label}</span>
                                        {COLUMNS[key].stockOnly && <span className="text-[10px] text-gray-500">stocks</span>}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                )}
                <fieldset className="mt-3">
                    <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Rows</legend>
                    <div className="flex gap-1" role="radiogroup" aria-label="Row height">
                        {(["compact", "comfortable"] as Density[]).map((density) => (
                            <button
                                key={density}
                                type="button"
                                role="radio"
                                aria-checked={prefs.density === density}
                                onClick={() => set({ density })}
                                className={cn(
                                    "h-7 flex-1 cursor-pointer rounded-md border text-xs font-semibold capitalize",
                                    prefs.density === density ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:text-gray-100"
                                )}
                            >
                                {density}
                            </button>
                        ))}
                    </div>
                </fieldset>
                {showPanelToggle && (
                    <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={prefs.panel} onChange={() => set({ panel: !prefs.panel })} className="h-3.5 w-3.5 accent-gray-100" />
                        Details panel beside the grid
                    </label>
                )}
                <button
                    type="button"
                    onClick={() => onChange({ ...DEFAULT_PREFS, sort: prefs.sort })}
                    className="mt-3 h-7 w-full cursor-pointer rounded-md border border-gray-600 text-xs font-semibold text-gray-400 hover:text-gray-100"
                >
                    Reset columns and rows
                </button>
            </PopoverContent>
        </Popover>
    );
};

export default ColumnsMenu;
