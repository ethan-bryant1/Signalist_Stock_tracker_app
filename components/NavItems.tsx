"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// The main menu: tabs across the header ("bar"), or a list inside the account menu on smaller screens ("menu")
const NavItems = ({ variant = "bar" }: { variant?: "bar" | "menu" }) => {
    const pathname = usePathname();

    const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));

    if (variant === "menu") {
        return (
            <ul className="flex flex-col gap-3 p-2 font-medium">
                {NAV_ITEMS.map(({ href, label }) => (
                    <li key={href}>
                        <Link
                            href={href}
                            aria-current={isActive(href) ? "page" : undefined}
                            className={cn("transition-colors hover:text-gray-100", isActive(href) && "text-gray-100")}
                        >
                            {label}
                        </Link>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <ul className="flex h-full items-stretch">
            {NAV_ITEMS.map(({ href, label }) => {
                const active = isActive(href);
                return (
                    <li key={href} className="flex">
                        <Link
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                                "relative flex items-center px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors xl:px-3 2xl:px-4",
                                active ? "text-gray-100" : "text-gray-500 hover:text-gray-100"
                            )}
                        >
                            {label}
                            {/* The open page's tab is underlined with a hairline */}
                            {active && <span aria-hidden className="absolute inset-x-2.5 bottom-0 h-px bg-gray-100 xl:inset-x-3 2xl:inset-x-4" />}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
};

export default NavItems;
