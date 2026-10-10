import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelProps {
    title: string;
    description?: string;
    // Shows an "Open" link in the corner that opens this page in a new browser tab
    href?: string;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}

// A bordered box with a title bar, used to frame each block of the dashboard and heatmap pages
const Panel = ({ title, description, href, className, bodyClassName, children }: PanelProps) => (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-800", className)}>
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-gray-600 px-4 py-3">
            <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-100">{title}</h2>
                {description && <p className="mt-0.5 truncate text-xs text-gray-500">{description}</p>}
            </div>
            {href && (
                <Link
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${title} in a new tab`}
                    className="group inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-100"
                >
                    Open
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
            )}
        </header>
        <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
);

export default Panel;
