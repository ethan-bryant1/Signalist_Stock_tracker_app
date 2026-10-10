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
import { LogOut } from "lucide-react";
import NavItems from "@/components/NavItems";
import { signOut } from "@/lib/actions/auth.actions";
import { toast } from "sonner";

const UserDropdown = ({ user }: { user: User }) => {
    const router = useRouter();

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
                        className="flex items-center gap-3 text-gray-400 hover:text-gray-100"
                    />
                }
            >
                <Avatar className="h-8 w-8">

                    <AvatarFallback className="bg-gray-100 text-sm font-bold text-gray-900">
                        {user.name[0]}
                    </AvatarFallback>
                </Avatar>

                <div className="hidden flex-col items-start md:flex">
          <span className="text-base font-medium text-gray-400">
            {user.name}
          </span>
                </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width) text-gray-400">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>
                        <div className="relative flex items-center gap-3 py-2">
                            <Avatar className="h-10 w-10">

                                <AvatarFallback className="bg-gray-100 text-sm font-bold text-gray-900">
                                    {user.name[0]}
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

                {/* Only on phones, where the nav links follow below */}
                <DropdownMenuSeparator className="bg-gray-600 sm:hidden" />

                <nav className="sm:hidden">
                    <NavItems />
                </nav>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default UserDropdown;