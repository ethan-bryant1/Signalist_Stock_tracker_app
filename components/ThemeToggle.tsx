"use client";

import { Moon, Sun } from "lucide-react";
import useTheme from "@/hooks/useTheme";
import { THEME_COOKIE } from "@/lib/theme";

const ThemeToggle = () => {
    const theme = useTheme();
    const next = theme === "dark" ? "light" : "dark";

    const toggle = () => {
        document.documentElement.classList.toggle("dark", next === "dark");
        // Remember the choice for a year so the server renders the same theme next time
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${next} theme`}
            title={`Switch to ${next} theme`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-100"
        >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
    );
};

export default ThemeToggle;
