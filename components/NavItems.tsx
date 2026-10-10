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
                        <Link href={href} className={cn("transition-colors hover:text-gray-100", isActive(href) && "text-gray-100")}>
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
                                "relative flex items-center px-3 text-sm font-medium transition-colors",
                                active ? "text-gray-100" : "text-gray-500 hover:text-gray-100"
                            )}
                        >
                            {label}
                            {/* The open page's tab is underlined, like a trading platform's menu */}
                            {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-t-full bg-gray-100" />}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
};

export default NavItems;
