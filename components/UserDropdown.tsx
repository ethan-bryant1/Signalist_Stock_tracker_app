"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Avatar,
    AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import NavItems from "@/components/NavItems";
import { signOut } from "@/lib/actions/auth.actions";
import { toast } from "sonner";

// "EB" for Ethan Bryant
const initialsOf = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";

const UserDropdown = ({ user }: { user: User }) => {
    const router = useRouter();
    const initials = initialsOf(user.name);

    const handleSignOut = async () => {
        const result = await signOut();
        if (result && !result.success) {
            toast.error("Sign out failed");
            return;
        }
        router.push("/sign-in");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        className="flex h-10 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                    />
                }
            >
                <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-800 text-[11px] font-semibold tracking-wider text-gray-100 ring-1 ring-gray-500/60">
                        {initials}
                    </AvatarFallback>
                </Avatar>

                <span className="hidden max-w-36 truncate text-sm font-medium text-gray-100 xl:block">
                    {user.name}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-gray-500 sm:block" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width) text-gray-400">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>
                        <div className="relative flex items-center gap-3 py-2">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-gray-800 text-xs font-semibold tracking-wider text-gray-100 ring-1 ring-gray-500/60">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex flex-col">
                <span className="text-base font-medium text-gray-400">
                  {user.name}
                </span>

                                <span className="text-sm text-gray-500">
                  {user.email}
                </span>
                            </div>
                        </div>
                    </DropdownMenuLabel>

                    <DropdownMenuSeparator className="bg-gray-600" />

                    <DropdownMenuItem
                        onClick={handleSignOut}
                        className="text-md cursor-pointer font-medium text-gray-100 transition-colors focus:bg-transparent focus:text-gray-400"
                    >
                        <LogOut className="mr-2 hidden h-4 w-4 sm:block" />
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuGroup>

                {/* Below large screens the header has no room for the menu, so it's listed here */}
                <DropdownMenuSeparator className="bg-gray-600 lg:hidden" />

                <nav aria-label="Main" className="lg:hidden">
                    <NavItems variant="menu" />
                </nav>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default UserDropdown;