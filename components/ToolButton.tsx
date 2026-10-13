import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// A small bordered button for a panel's title bar or toolbar; pressed reads as on
export const ToolButton = ({
    onClick,
    pressed,
    title,
    className,
    children,
    ...rest
}: { onClick?: () => void; pressed?: boolean; title: string; className?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title" | "className" | "children">) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        title={title}
        className={cn(
            "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-100 disabled:cursor-not-allowed disabled:opacity-50",
            pressed ? "border-gray-100 bg-gray-100 text-gray-900" : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-100",
            className
        )}
        {...rest}
    >
        {children}
    </button>
);

// Full screen toggle, hidden but holding its place until the browser says whether it supports full screen
export const FullscreenButton = ({ canFullscreen, isFullscreen, onToggle }: { canFullscreen: boolean | null; isFullscreen: boolean; onToggle: () => void }) =>
    canFullscreen === false ? null : (
        <span className={cn("contents", canFullscreen === null && "[&>button]:invisible")} aria-hidden={canFullscreen === null || undefined}>
            <ToolButton onClick={onToggle} title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}>
                {isFullscreen ? <Minimize2 aria-hidden className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
                <span className="sr-only sm:hidden">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
            </ToolButton>
        </span>
    );
