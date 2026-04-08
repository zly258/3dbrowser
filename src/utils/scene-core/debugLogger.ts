const isDevHost = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
);

export function debugLog(scope: string, ...args: unknown[]) {
    if (!isDevHost) return;
    console.log(`[${scope}]`, ...args);
}

export function debugWarn(scope: string, ...args: unknown[]) {
    if (!isDevHost) return;
    console.warn(`[${scope}]`, ...args);
}

