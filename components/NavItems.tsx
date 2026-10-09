"use client";

import {NAV_ITEMS} from "@/lib/constants";
import Link from "next/link";
import {usePathname} from "next/navigation";
import SearchCommand, {OPEN_SEARCH_EVENT} from "@/components/SearchCommand";

const NavItems = ({ initialStocks, inMenu = false }: { initialStocks: StockWithWatchlistStatus[]; inMenu?: boolean }) => {
    const pathname = usePathname();

    const isActive = (path: string) => {
        if (path === "/") return pathname === "/";

        return pathname.startsWith(path);
    };

    return (
        <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium">
            {NAV_ITEMS.map(({ href, label }) => {
                // The menu closes when the dialog opens, so it asks the header's search to open instead
                if (href === "/search" && inMenu) return (
                    <li key="search-trigger">
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
                            className="search-text"
                        >
                            {label}
                        </button>
                    </li>
                );

                if (href === "/search") return (
                    <li key="search-trigger">
                        <SearchCommand
                            renderAs="text"
                            label="Search"
                            initialStocks={initialStocks}
                        />
                    </li>
                );

                return <li key={href}>
                    <Link
                        href={href}
                        className={`hover:text-yellow-500 transition-colors ${
                            isActive(href) ? "text-gray-100" : ""
                        }`}
                    >
                        {label}
                    </Link>
                </li>;
            })}
        </ul>
    );
};

export default NavItems;