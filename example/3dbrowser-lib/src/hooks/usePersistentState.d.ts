interface PersistentStateOptions<T> {
    storage?: Storage;
    serializer?: (value: T) => string;
    parser?: (raw: string) => T;
}
export declare function usePersistentState<T>(key: string, initialValue: T | (() => T), options?: PersistentStateOptions<T>): readonly [T, import("react").Dispatch<import("react").SetStateAction<T>>];
export {};
