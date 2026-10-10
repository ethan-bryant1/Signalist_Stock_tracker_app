import Link from "next/link";
import Logo from "@/components/Logo";
import NavItems from "@/components/NavItems";
import UserDropdown from "./UserDropdown";
import ThemeToggle from "@/components/ThemeToggle";
import SearchCommand from "@/components/SearchCommand";
import MarketStrip from "@/components/MarketStrip";
import {searchStocks} from "@/lib/actions/finnhub.actions";

// Two rows, like a trading platform: the menu bar with search and the account menu,
// then a strip of live market prices
const Header = async ({ user }: { user: User }) => {
    const initialStocks = await searchStocks();

    return (
        <header className="sticky top-0 z-50 w-full">
            <div className="border-b border-gray-600 bg-gray-800">
                <div className="container flex h-16 items-center justify-between gap-6">
                    <div className="flex h-full min-w-0 items-center gap-5">
                        <Link href="/" aria-label="Loops Watch dashboard" className="shrink-0">
                            <Logo className="h-11" />
                        </Link>
                        <span aria-hidden className="hidden h-6 w-px bg-gray-600 lg:block" />
                        <nav aria-label="Main" className="hidden h-full lg:block">
                            <NavItems />
                        </nav>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <SearchCommand initialStocks={initialStocks} />
                        <ThemeToggle />
                        <span aria-hidden className="mx-1 hidden h-6 w-px bg-gray-600 sm:block" />
                        <UserDropdown user={user} />
                    </div>
                </div>
            </div>
            <MarketStrip />
        </header>
    );
};

export default Header;
