'use client';
import { useSyncExternalStore } from "react";
import type { Theme } from "@/lib/theme";

// The current theme is the "dark" class on <html> (set by the root layout and ThemeToggle)
const subscribe = (onChange: () => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
};

export const getCurrentTheme = (): Theme =>
    document.documentElement.classList.contains("dark") ? "dark" : "light";

const useTheme = (): Theme => useSyncExternalStore(subscribe, getCurrentTheme, () => "light");

export default useTheme;
