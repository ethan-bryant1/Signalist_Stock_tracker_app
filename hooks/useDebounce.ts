'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useDebounce(callback: () => void, delay: number) {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);

    // Always call the latest callback, so the debounced function can stay the same
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => () => {
        if(timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    return useCallback(() => {
        if(timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => callbackRef.current(), delay);
    }, [delay])
}
