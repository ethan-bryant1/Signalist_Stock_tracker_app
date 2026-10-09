import Link from "next/link";
import Image from "next/image";
import NavItems from "@/components/NavItems";
import UserDropdown from "./UserDropdown";
import ThemeToggle from "@/components/ThemeToggle";
import {searchStocks} from "@/lib/actions/finnhub.actions";

const Header = async ({ user }: { user: User }) => {
    const initialStocks = await searchStocks();

    return (
        <header className="sticky top-0 header">
            <div className="container header-wrapper">
                <Link href="/">
                    {/* The logo text is white, so light mode uses a copy with dark text */}
                    <Image
                        src="/assets/icons/logo-light.svg"
                        alt="Signalist logo"
                        width={140}
                        height={32}
                        className="h-8 w-auto cursor-pointer dark:hidden"
                    />
                    <Image
                        src="/assets/icons/logo.svg"
                        alt="Signalist logo"
                        width={140}
                        height={32}
                        className="h-8 w-auto cursor-pointer hidden dark:block"
                    />
                </Link>

                <nav className="hidden sm:block">
                    <NavItems initialStocks={initialStocks} />
                </nav>

                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <UserDropdown user={user} initialStocks={initialStocks} />
                </div>
            </div>
        </header>
    );
};

export default Header;