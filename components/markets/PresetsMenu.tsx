"use client";

import { useId, useState } from "react";
import { Bookmark, Check, Pencil, Save, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BUILT_IN_PRESETS, MAX_PRESET_NAME, MAX_PRESETS, describeState, sameScreen, type Preset, type ScreenState } from "@/lib/screener";
import { cn } from "@/lib/utils";

const iconButton =
    "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-30";
const inputClass = "h-8 min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-900 px-2.5 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-gray-400";

type Props = {
    state: ScreenState;
    presets: Preset[];
    activeId: string | null;
    canSave: boolean;
    listName: (id?: string) => string | undefined;
    onApply: (preset: Preset) => void;
    onCreate: (name: string) => string | null;
    onRename: (id: string, name: string) => string | null;
    onUpdate: (id: string) => void;
    onDelete: (id: string) => void;
};

const PresetRow = ({ preset, active, modified, onApply, children }: { preset: Preset; active: boolean; modified: boolean; onApply: () => void; children?: React.ReactNode }) => (
    <li className={cn("group flex items-center gap-1 rounded-md pr-1", active ? "bg-gray-700" : "hover:bg-gray-700/40")}>
        <button type="button" onClick={onApply} aria-current={active || undefined} className="flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-gray-100">
            <span className="flex w-full items-center gap-1.5 text-sm font-medium text-gray-100">
                <span className="truncate">{preset.name}</span>
                {active && <Check aria-label="On show" className="h-3.5 w-3.5 shrink-0" />}
                {active && modified && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-500">changed</span>}
            </span>
            <span className="line-clamp-2 text-[11px] text-gray-500">{preset.description}</span>
        </button>
        {children}
    </li>
);

// Ready-made screens and the user's own, like IBKR's saved scanners: apply, save the current screen as a new one,
// rename, overwrite with the current screen, delete. Saved with the account.
const PresetsMenu = ({ state, presets, activeId, canSave, listName, onApply, onCreate, onRename, onUpdate, onDelete }: Props) => {
    const ids = useId();
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    // Applying a preset closes the menu, so the screen it opens is in view
    const apply = (preset: Preset) => {
        onApply(preset);
        setOpen(false);
    };
    const all = [...BUILT_IN_PRESETS, ...presets];
    const active = all.find((preset) => preset.id === activeId) ?? null;
    const modified = !!active && !sameScreen(active.state, state);

    const create = () => {
        const problem = onCreate(name);
        setError(problem);
        if (!problem) setName("");
    };
    const finishRename = () => {
        if (!renaming) return;
        const problem = onRename(renaming.id, renaming.name);
        setError(problem);
        if (!problem) setRenaming(null);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                title="Ready-made and saved screens"
                className="inline-flex h-8 max-w-60 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100"
            >
                <Bookmark aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{active ? active.name : "Presets"}</span>
                {modified && <span className="text-[10px] uppercase tracking-wider text-gray-500">changed</span>}
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-[min(40rem,80vh)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto border border-gray-600 bg-gray-800 p-2 text-gray-100">
                <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ready-made</p>
                <ul className="flex flex-col">
                    {BUILT_IN_PRESETS.map((preset) => (
                        <PresetRow key={preset.id} preset={preset} active={preset.id === activeId} modified={modified} onApply={() => apply(preset)} />
                    ))}
                </ul>

                <p className="mt-3 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">My presets</p>
                {presets.length === 0 ? (
                    <p className="px-2 pb-2 text-xs text-gray-500">None yet. Set up a screen and save it below.</p>
                ) : (
                    <ul className="flex flex-col">
                        {presets.map((preset) =>
                            renaming?.id === preset.id ? (
                                <li key={preset.id} className="flex items-center gap-1 px-1 py-1">
                                    <label htmlFor={`${ids}-rename`} className="sr-only">
                                        New name for {preset.name}
                                    </label>
                                    <input
                                        id={`${ids}-rename`}
                                        autoFocus
                                        value={renaming.name}
                                        maxLength={MAX_PRESET_NAME}
                                        onChange={(event) => setRenaming({ id: preset.id, name: event.target.value })}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") finishRename();
                                            if (event.key === "Escape") {
                                                event.stopPropagation();
                                                setRenaming(null);
                                            }
                                        }}
                                        className={inputClass}
                                    />
                                    <button type="button" onClick={finishRename} aria-label="Save name" title="Save name" className={iconButton}>
                                        <Check aria-hidden className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" onClick={() => setRenaming(null)} aria-label="Cancel rename" title="Cancel" className={iconButton}>
                                        <X aria-hidden className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ) : confirmDelete === preset.id ? (
                                <li key={preset.id} role="alert" className="flex items-center gap-2 rounded-md bg-gray-700/40 px-2 py-1.5 text-xs">
                                    <span className="min-w-0 flex-1">Delete “{preset.name}”?</span>
                                    <button type="button" autoFocus onClick={() => setConfirmDelete(null)} className="h-7 cursor-pointer rounded-md border border-gray-600 px-2 font-semibold text-gray-400 hover:text-gray-100">
                                        Keep
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onDelete(preset.id);
                                            setConfirmDelete(null);
                                        }}
                                        className="h-7 cursor-pointer rounded-md border border-gray-100 bg-gray-100 px-2 font-semibold text-gray-900"
                                    >
                                        Delete
                                    </button>
                                </li>
                            ) : (
                                <PresetRow key={preset.id} preset={{ ...preset, description: describeState(preset.state, listName(preset.state.listId)) }} active={preset.id === activeId} modified={modified} onApply={() => apply(preset)}>
                                    {preset.id === activeId && modified && (
                                        <button type="button" disabled={!canSave} onClick={() => onUpdate(preset.id)} aria-label={`Save changes to ${preset.name}`} title="Save the screen on show into this preset" className={iconButton}>
                                            <Save aria-hidden className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <button type="button" disabled={!canSave} onClick={() => setRenaming({ id: preset.id, name: preset.name })} aria-label={`Rename ${preset.name}`} title="Rename" className={iconButton}>
                                        <Pencil aria-hidden className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" disabled={!canSave} onClick={() => setConfirmDelete(preset.id)} aria-label={`Delete ${preset.name}`} title="Delete" className={iconButton}>
                                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                                    </button>
                                </PresetRow>
                            )
                        )}
                    </ul>
                )}

                <form
                    className="mt-3 border-t border-gray-700 px-1 pt-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        create();
                    }}
                >
                    <label htmlFor={`${ids}-name`} className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Save this screen as a preset
                    </label>
                    <p className="mt-0.5 mb-1.5 text-[11px] text-gray-500">{describeState(state, listName(state.listId))}</p>
                    <div className="flex gap-1.5">
                        <input id={`${ids}-name`} value={name} maxLength={MAX_PRESET_NAME} onChange={(event) => setName(event.target.value)} placeholder="Preset name" disabled={!canSave} className={inputClass} />
                        <button type="submit" disabled={!canSave || presets.length >= MAX_PRESETS} className="h-8 shrink-0 cursor-pointer rounded-lg border border-gray-100 bg-gray-100 px-3 text-xs font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-40">
                            Save
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="mt-1.5 text-xs text-gray-100">
                            {error}
                        </p>
                    )}
                    {!canSave && <p className="mt-1.5 text-xs text-gray-500">Saving is off: the database couldn&apos;t be reached. Reload to try again.</p>}
                    {state.universe === "us" && <p className="mt-1.5 text-[11px] text-gray-500">Saves TradingView&apos;s screen and column view. Filters set inside TradingView&apos;s own toolbar can&apos;t be read, so they aren&apos;t saved.</p>}
                </form>
            </PopoverContent>
        </Popover>
    );
};

export default PresetsMenu;
