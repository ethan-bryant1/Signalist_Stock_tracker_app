'use client';

import { useCallback, useRef, useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
};
// Unknown (null) until the browser answers, so the server's HTML keeps room for the button and nothing jumps.
// iPhones have no Fullscreen API, so fullscreenEnabled is undefined there.
const supported = () => !!document.fullscreenEnabled;
const unknown = () => null;

// Full screen for one element of the page (a chart or a map), through the browser's Fullscreen API. Only this
// element in full screen counts, not a video elsewhere.
export const useFullscreen = <T extends HTMLElement = HTMLDivElement>() => {
    const ref = useRef<T>(null);
    const canFullscreen = useSyncExternalStore(subscribe, supported, unknown);
    const isFullscreen = useSyncExternalStore(subscribe, () => !!ref.current && document.fullscreenElement === ref.current, () => false);
    const toggle = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else ref.current?.requestFullscreen().catch(() => {});
    }, []);
    return { ref, canFullscreen, isFullscreen, toggle };
};
