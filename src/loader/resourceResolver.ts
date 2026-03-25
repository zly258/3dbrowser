export interface ResourceResolver {
    resolve: (url: string) => string;
    dispose: () => void;
    has: (url: string) => boolean;
}

function normalizePath(path: string) {
    return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "").toLowerCase();
}

function candidateKeys(input: string) {
    const normalized = normalizePath(input);
    const parts = normalized.split("/");
    const fileName = parts[parts.length - 1];

    return Array.from(new Set([
        normalized,
        fileName,
        `./${normalized}`,
        `./${fileName}`
    ]));
}

export function createResourceResolver(files: (File | string)[]): ResourceResolver | null {
    const localFiles = files.filter((item): item is File => item instanceof File);
    if (localFiles.length === 0) return null;

    const blobUrlMap = new Map<string, string>();

    const register = (key: string, file: File) => {
        if (!key || blobUrlMap.has(key)) return;
        blobUrlMap.set(key, URL.createObjectURL(file));
    };

    localFiles.forEach((file) => {
        register(normalizePath(file.name), file);

        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        if (relativePath) {
            const trimmed = relativePath.split("/").slice(1).join("/");
            register(normalizePath(trimmed), file);
        }
    });

    return {
        resolve: (url: string) => {
            if (!url || /^(blob:|data:|https?:)/i.test(url)) return url;

            for (const key of candidateKeys(url)) {
                const resolved = blobUrlMap.get(key);
                if (resolved) return resolved;
            }

            return url;
        },
        has: (url: string) => candidateKeys(url).some((key) => blobUrlMap.has(key)),
        dispose: () => {
            blobUrlMap.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
            blobUrlMap.clear();
        }
    };
}
