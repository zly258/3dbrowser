import { useEffect, useState } from "react";

interface PersistentStateOptions<T> {
    storage?: Storage;
    serializer?: (value: T) => string;
    parser?: (raw: string) => T;
}

export function usePersistentState<T>(
    key: string,
    initialValue: T | (() => T),
    options: PersistentStateOptions<T> = {}
) {
    const {
        storage = typeof window !== "undefined" ? window.localStorage : undefined,
        serializer = JSON.stringify,
        parser = JSON.parse
    } = options;

    const resolveInitialValue = () =>
        typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;

    const [state, setState] = useState<T>(() => {
        const fallback = resolveInitialValue();
        if (!storage) return fallback;

        try {
            const raw = storage.getItem(key);
            if (raw === null) return fallback;
            return parser(raw);
        } catch (error) {
            console.warn(`[usePersistentState] Failed to read "${key}"`, error);
            return fallback;
        }
    });

    useEffect(() => {
        if (!storage) return;

        try {
            storage.setItem(key, serializer(state));
        } catch (error) {
            console.warn(`[usePersistentState] Failed to write "${key}"`, error);
        }
    }, [key, serializer, state, storage]);

    return [state, setState] as const;
}
