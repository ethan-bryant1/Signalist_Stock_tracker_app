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

const UserDropdown = ({ user }: { user: User }) => {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push("/sign-in");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        className="flex items-center gap-3 text-gray-400 hover:text-yellow-500"
                    />
                }
            >
                <Avatar className="h-8 w-8">

                    <AvatarFallback className="bg-yellow-500 text-sm font-bold text-yellow-900">
                        {user.name[0]}
                    </AvatarFallback>
                </Avatar>

                <div className="hidden flex-col items-start md:flex">
          <span className="text-base font-medium text-gray-400">
            {user.name}
          </span>
                </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="text-gray-400">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>
                        <div className="relative flex items-center gap-3 py-2">
                            <Avatar className="h-10 w-10">

                                <AvatarFallback className="bg-yellow-500 text-sm font-bold text-yellow-900">
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
                        className="text-md cursor-pointer font-medium text-gray-100 transition-colors focus:bg-transparent focus:text-yellow-500"
                    >
                        <LogOut className="mr-2 hidden h-4 w-4 sm:block" />
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator className="hidden bg-gray-600 sm:block" />

                <nav className="sm:hidden">
                    <NavItems />
                </nav>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default UserDropdown;