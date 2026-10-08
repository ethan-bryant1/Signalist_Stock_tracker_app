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
    AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import NavItems from "@/components/NavItems";

const UserDropdown = () => {
    const router = useRouter();

    const handleSignOut = async () => {
        router.push("/sign-in");
    };

    const user = {
        name: "loops",
        email: "loops_dubz@gmail.com",
    };

    const avatarUrl =
        "https://p19-common-sign.tiktokcdn-us.com/tos-useast5-avt-0068-tx/90b04285f532b199f71ca172568b152f~tplv-tiktokx-cropcenter:1080:1080.jpeg?dr=9640&refresh_token=d958cced&x-expires=1787446800&x-signature=ftZw5QYn6taJVkc2lAXNAH9fRx0%3D&t=4d5b0474&ps=13740610&shp=a5d48078&shcp=81f88b70&idc=useast5";

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
                    <AvatarImage src={avatarUrl} alt={user.name} />

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
                                <AvatarImage src={avatarUrl} alt={user.name} />

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