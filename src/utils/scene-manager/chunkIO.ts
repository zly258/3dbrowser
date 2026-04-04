export function getChunkReadCacheKey(chunk: any) {
    return `${chunk.nbimFileId || "local"}:${chunk.byteOffset || 0}:${chunk.byteLength || 0}`;
}

export function hasValidChunkBinaryRange(chunk: any) {
    return Number.isFinite(chunk?.byteOffset)
        && Number.isFinite(chunk?.byteLength)
        && chunk.byteLength > 0;
}

export function touchChunkReadCache(cacheOrder: string[], cacheKey: string) {
    const nextOrder = cacheOrder.filter((key) => key !== cacheKey);
    nextOrder.push(cacheKey);
    return nextOrder;
}

export function putChunkReadCache(options: {
    chunkReadCache: Map<string, ArrayBuffer>;
    chunkReadCacheOrder: string[];
    cacheKey: string;
    buffer: ArrayBuffer;
    chunkReadCacheSize: number;
}) {
    const {
        chunkReadCache,
        chunkReadCacheOrder,
        cacheKey,
        buffer,
        chunkReadCacheSize
    } = options;

    chunkReadCache.set(cacheKey, buffer);
    let nextOrder = touchChunkReadCache(chunkReadCacheOrder, cacheKey);
    while (nextOrder.length > chunkReadCacheSize) {
        const evictKey = nextOrder.shift();
        if (!evictKey) continue;
        chunkReadCache.delete(evictKey);
    }
    return nextOrder;
}

export async function readChunkBuffer(options: {
    chunk: any;
    nbimFiles: Map<string, File>;
    chunkReadCache: Map<string, ArrayBuffer>;
    chunkReadCacheOrder: string[];
    chunkReadCacheSize: number;
}) {
    const {
        chunk,
        nbimFiles,
        chunkReadCache,
        chunkReadCacheOrder,
        chunkReadCacheSize
    } = options;

    const cacheKey = getChunkReadCacheKey(chunk);
    const cached = chunkReadCache.get(cacheKey);
    if (cached) {
        return {
            buffer: cached.slice(0),
            chunkReadCacheOrder: touchChunkReadCache(chunkReadCacheOrder, cacheKey)
        };
    }

    const file = nbimFiles.get(chunk.nbimFileId);
    if (!file) {
        throw new Error(`NBIM file not found for chunk: ${chunk.id}`);
    }

    const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
    return {
        buffer,
        chunkReadCacheOrder: putChunkReadCache({
            chunkReadCache,
            chunkReadCacheOrder,
            cacheKey,
            buffer: buffer.slice(0),
            chunkReadCacheSize
        })
    };
}

export function enqueueChunkPrefetch(options: {
    chunkIds: string[];
    chunkPrefetchWindow: number;
    prefetchQueue: string[];
    prefetchQueueSet: Set<string>;
    prefetchInFlight: Set<string>;
}) {
    const {
        chunkIds,
        chunkPrefetchWindow,
        prefetchQueue,
        prefetchQueueSet,
        prefetchInFlight
    } = options;

    if (chunkPrefetchWindow <= 0) {
        return prefetchQueue;
    }

    const nextQueue = [...prefetchQueue];
    for (const chunkId of chunkIds) {
        if (prefetchQueueSet.has(chunkId)) continue;
        if (prefetchInFlight.has(chunkId)) continue;
        nextQueue.push(chunkId);
        prefetchQueueSet.add(chunkId);
    }
    return nextQueue;
}

export function collectPrefetchCandidates(options: {
    visibleChunks: any[];
    chunkPrefetchWindow: number;
    prefetchPaused: boolean;
    isCameraMoving: boolean;
    prefetchRoundRobinCursor: number;
    chunks: any[];
    processingChunks: Set<string>;
    chunkReadCache: Map<string, ArrayBuffer>;
    getChunkIndex: (chunkId: string) => number;
}) {
    const {
        visibleChunks,
        chunkPrefetchWindow,
        prefetchPaused,
        isCameraMoving,
        prefetchRoundRobinCursor,
        chunks,
        processingChunks,
        chunkReadCache,
        getChunkIndex
    } = options;

    if (chunkPrefetchWindow <= 0 || prefetchPaused || isCameraMoving || visibleChunks.length === 0) {
        return {
            chunkIds: [] as string[],
            prefetchRoundRobinCursor
        };
    }

    const toPrefetch: string[] = [];
    for (let index = 0; index < visibleChunks.length && toPrefetch.length < chunkPrefetchWindow; index++) {
        const pivot = visibleChunks[(prefetchRoundRobinCursor + index) % visibleChunks.length];
        const pivotIndex = getChunkIndex(pivot.id);
        if (pivotIndex < 0) continue;

        const nextChunk = chunks[pivotIndex + 1];
        if (!nextChunk || nextChunk.loaded || processingChunks.has(nextChunk.id)) continue;
        if (!nextChunk.nbimFileId || !hasValidChunkBinaryRange(nextChunk)) continue;

        const cacheKey = getChunkReadCacheKey(nextChunk);
        if (chunkReadCache.has(cacheKey)) continue;
        toPrefetch.push(nextChunk.id);
    }

    return {
        chunkIds: toPrefetch,
        prefetchRoundRobinCursor: prefetchRoundRobinCursor + 1
    };
}
