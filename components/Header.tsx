import Link from "next/link";
import Logo from "@/components/Logo";
import NavItems from "@/components/NavItems";
import UserDropdown from "./UserDropdown";
import ThemeToggle from "@/components/ThemeToggle";
import SearchCommand from "@/components/SearchCommand";
import {searchStocks} from "@/lib/actions/finnhub.actions";

const Header = async ({ user }: { user: User }) => {
    const initialStocks = await searchStocks();

    return (
        <header className="sticky top-0 header">
            <div className="container header-wrapper gap-6">
                <div className="flex items-center gap-6 lg:gap-10">
                    <Link href="/" className="shrink-0">
                        <Logo />
                    </Link>

                    <nav className="hidden sm:block">
                        <NavItems />
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    <SearchCommand initialStocks={initialStocks} />
                    <ThemeToggle />
                    <UserDropdown user={user} />
                </div>
            </div>
        </header>
    );
};

export default Header;