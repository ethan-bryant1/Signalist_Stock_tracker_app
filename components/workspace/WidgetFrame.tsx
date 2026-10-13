'use client';

import { ArrowDown, ArrowUp, GripVertical, Link2, Link2Off, MoreHorizontal, MoveHorizontal, MoveVertical, X } from "lucide-react";
import SymbolField from "@/components/workspace/SymbolField";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WIDGETS, type Widget } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type WidgetFrameProps = {
    widget: Widget;
    symbol: string;
    editing: boolean;
    canMoveEarlier: boolean;
    canMoveLater: boolean;
    scroll: boolean;
    onMove: (direction: -1 | 1) => void;
    onResize: (dw: number, dh: number) => void;
    onRemove: () => void;
    onLink: (linked: boolean) => void;
    onOwnSymbol: (symbol: string) => void;
    children: React.ReactNode;
};

const itemClass = "flex cursor-pointer items-center gap-2 text-sm text-gray-100";

// One widget's panel: a title bar (the drag handle while editing) with the symbol it shows, its link to the
// workspace's symbol, and a menu that moves, resizes and removes it without dragging
const WidgetFrame = ({ widget, symbol, editing, canMoveEarlier, canMoveLater, scroll, onMove, onResize, onRemove, onLink, onOwnSymbol, children }: WidgetFrameProps) => {
    const { title, source, symbolic } = WIDGETS[widget.type];

    return (
        <section aria-label={symbolic ? `${title}, ${symbol}` : title} className={cn("flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-gray-800", editing ? "border-gray-500" : "border-gray-600")}>
            <header className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-gray-600 pl-2 pr-1", editing && "ws-drag-handle cursor-grab active:cursor-grabbing")}>
                {editing && <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-gray-500" />}
                <h2 className={cn("min-w-0 truncate text-[13px] font-semibold text-gray-100", !editing && "pl-1.5")}>{title}</h2>
                {symbolic &&
                    (widget.linked ? (
                        <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-100" title="Follows the workspace's linked symbol">
                            {symbol}
                        </span>
                    ) : (
                        <SymbolField label={`${title} symbol`} value={symbol} onCommit={onOwnSymbol} compact />
                    ))}
                <span className="hidden min-w-0 truncate text-[11px] text-gray-500 sm:inline">{source}</span>

                <div className="ws-no-drag ml-auto flex shrink-0 items-center">
                    {symbolic && (
                        <button
                            type="button"
                            onClick={() => onLink(!widget.linked)}
                            aria-pressed={widget.linked}
                            title={widget.linked ? "Linked: follows the workspace's symbol. Press to give it its own." : "Unlinked: keeps its own symbol. Press to follow the workspace's."}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100"
                        >
                            {widget.linked ? <Link2 aria-hidden className="h-4 w-4" /> : <Link2Off aria-hidden className="h-4 w-4" />}
                            <span className="sr-only">{widget.linked ? "Unlink from the workspace symbol" : "Link to the workspace symbol"}</span>
                        </button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label={`${title} options`}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100 focus-visible:outline-2 focus-visible:outline-gray-100"
                        >
                            <MoreHorizontal aria-hidden className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-xs text-gray-500">{title}</DropdownMenuLabel>
                                <DropdownMenuItem disabled={!canMoveEarlier} onClick={() => onMove(-1)} className={itemClass}>
                                    <ArrowUp aria-hidden className="h-4 w-4" /> Move earlier
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!canMoveLater} onClick={() => onMove(1)} className={itemClass}>
                                    <ArrowDown aria-hidden className="h-4 w-4" /> Move later
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-gray-600" />
                                <DropdownMenuItem onClick={() => onResize(1, 0)} className={itemClass}>
                                    <MoveHorizontal aria-hidden className="h-4 w-4" /> Wider
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onResize(-1, 0)} className={itemClass}>
                                    <MoveHorizontal aria-hidden className="h-4 w-4" /> Narrower
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onResize(0, 2)} className={itemClass}>
                                    <MoveVertical aria-hidden className="h-4 w-4" /> Taller
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onResize(0, -2)} className={itemClass}>
                                    <MoveVertical aria-hidden className="h-4 w-4" /> Shorter
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-gray-600" />
                                <DropdownMenuItem onClick={onRemove} className={itemClass}>
                                    <X aria-hidden className="h-4 w-4" /> Remove widget
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            <div className={cn("relative min-h-0 flex-1", scroll ? "overflow-y-auto" : "overflow-hidden")}>{children}</div>
        </section>
    );
};

export default WidgetFrame;
