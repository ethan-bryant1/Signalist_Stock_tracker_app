"use client";

import { useRef, type KeyboardEvent } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MAX_LISTS, MAX_NAME, type WatchList } from "@/lib/watchlists";
import { cn } from "@/lib/utils";

type Props = {
    lists: WatchList[];
    activeId: string;
    // The list being renamed, if any
    renaming: string | null;
    panelId: string;
    onOpen: (listId: string) => void;
    onCreate: () => void;
    onStartRename: (listId: string) => void;
    onRename: (listId: string, name: string) => void;
    onCancelRename: () => void;
    onAskDelete: (listId: string) => void;
};

// The lists as tabs, like the tabs of a Mosaic watchlist window: arrows move between them, double-click renames,
// the menu renames or deletes the open list and + makes a new one.
const ListTabs = ({ lists, activeId, renaming, panelId, onOpen, onCreate, onStartRename, onRename, onCancelRename, onAskDelete }: Props) => {
    const barRef = useRef<HTMLDivElement>(null);
    const active = lists.find((list) => list.id === activeId) ?? lists[0];

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || renaming) return;
        event.preventDefault();
        const at = lists.findIndex((list) => list.id === active.id);
        const to = event.key === "Home" ? 0 : event.key === "End" ? lists.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + lists.length) % lists.length;
        onOpen(lists[to].id);
        requestAnimationFrame(() => barRef.current?.querySelector<HTMLElement>(`[data-list="${lists[to].id}"]`)?.focus());
    };

    return (
        <div className="flex min-w-0 items-center gap-1">
            <div ref={barRef} role="tablist" aria-label="Watchlists" onKeyDown={onKeyDown} className="scrollbar-hide-default flex min-w-0 items-center gap-1 overflow-x-auto">
                {lists.map((list) => {
                    const selected = list.id === active.id;
                    if (renaming === list.id) {
                        return (
                            <form
                                key={list.id}
                                className="flex shrink-0 items-center"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    onRename(list.id, String(new FormData(event.currentTarget).get("name") ?? ""));
                                }}
                            >
                                <label className="sr-only" htmlFor={`rename-${list.id}`}>
                                    List name
                                </label>
                                <input
                                    id={`rename-${list.id}`}
                                    name="name"
                                    defaultValue={list.name}
                                    maxLength={MAX_NAME}
                                    autoFocus
                                    onFocus={(event) => event.currentTarget.select()}
                                    onKeyDown={(event) => event.key === "Escape" && onCancelRename()}
                                    onBlur={(event) => event.currentTarget.form?.requestSubmit()}
                                    className="h-8 w-40 rounded-md border border-gray-400 bg-gray-900 px-2 text-xs font-semibold text-gray-100 outline-none"
                                />
                            </form>
                        );
                    }
                    return (
                        <button
                            key={list.id}
                            type="button"
                            role="tab"
                            data-list={list.id}
                            aria-selected={selected}
                            aria-controls={selected ? panelId : undefined}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onOpen(list.id)}
                            onDoubleClick={() => onStartRename(list.id)}
                            title={`${list.name} · ${list.items.length} ${list.items.length === 1 ? "symbol" : "symbols"}${selected ? " (double-click to rename)" : ""}`}
                            className={cn(
                                "inline-flex h-8 max-w-48 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gray-100",
                                selected ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
                            )}
                        >
                            <span className="truncate">{list.name}</span>
                            <span className={cn("tabular-nums", selected ? "text-gray-600" : "text-gray-500")}>{list.items.length}</span>
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                onClick={onCreate}
                disabled={lists.length >= MAX_LISTS}
                aria-label="New list"
                title={lists.length >= MAX_LISTS ? `Up to ${MAX_LISTS} lists` : "New list"}
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Plus aria-hidden className="h-4 w-4" />
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={`${active.name} list options`}
                    title="Rename or delete this list"
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100"
                >
                    <MoreHorizontal aria-hidden className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => onStartRename(active.id)} className="cursor-pointer gap-2">
                            <Pencil aria-hidden className="h-3.5 w-3.5" />
                            Rename “{active.name}”
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onCreate} disabled={lists.length >= MAX_LISTS} className="cursor-pointer gap-2">
                            <Plus aria-hidden className="h-3.5 w-3.5" />
                            New list
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAskDelete(active.id)} disabled={lists.length <= 1} className="cursor-pointer gap-2">
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                            {lists.length <= 1 ? "The last list can't be deleted" : "Delete list…"}
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default ListTabs;
