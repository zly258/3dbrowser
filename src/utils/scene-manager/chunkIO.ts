export function getChunkReadCacheKey(chunk: any) {
    return `${chunk.nbimFileId || "local"}:${chunk.byteOffset || 0}:${chunk.byteLength || 0}`;
}

export function hasValidChunkBinaryRange(chunk: any) {
    return Number.isFinite(chunk?.byteOffset)
        && Number.isFinite(chunk?.byteLength)
        && chunk.byteLength > 0;
}

export function getChunkReadCacheBytes(cache: Map<string, ArrayBuffer>) {
    let bytes = 0;
    for (const buffer of cache.values()) bytes += buffer.byteLength || 0;
    return bytes;
}

/**
 * 按 LRU 顺序淘汰缓存，直到满足“条数 + 字节”双上限。
 * 注意：不能再用调用方传入的 order 快照回写——并发读取时快照会过期，
 * 导致 order 丢项、map 无界增长（实测全模型曾缓存 410 条 / 943MB）。
 * 这里直接从 Map 的插入顺序重建 order（命中时 delete+set 即为 LRU touch）。
 */
export function trimChunkReadCache(options: {
    chunkReadCache: Map<string, ArrayBuffer>;
    chunkReadCacheSize: number;
    chunkReadCacheMB: number;
}) {
    const { chunkReadCache, chunkReadCacheSize, chunkReadCacheMB } = options;
    const maxBytes = Math.max(16, chunkReadCacheMB) * 1048576;
    let bytes = getChunkReadCacheBytes(chunkReadCache);
    const order = Array.from(chunkReadCache.keys());

    while (order.length > chunkReadCacheSize || bytes > maxBytes) {
        if (order.length <= 1) break; // 至少保留最后写入的一条
        const evictKey = order.shift()!;
        const evicted = chunkReadCache.get(evictKey);
        if (!evicted) continue;
        bytes -= evicted.byteLength || 0;
        chunkReadCache.delete(evictKey);
    }

    return Array.from(chunkReadCache.keys());
}

export function putChunkReadCache(options: {
    chunkReadCache: Map<string, ArrayBuffer>;
    cacheKey: string;
    buffer: ArrayBuffer;
    chunkReadCacheSize: number;
    chunkReadCacheMB: number;
}) {
    const { chunkReadCache, cacheKey, buffer, chunkReadCacheSize, chunkReadCacheMB } = options;
    // 先删后插：把最近写入/访问的条目移到 Map 末尾（LRU）
    chunkReadCache.delete(cacheKey);
    chunkReadCache.set(cacheKey, buffer);
    return trimChunkReadCache({ chunkReadCache, chunkReadCacheSize, chunkReadCacheMB });
}

export async function readChunkBuffer(options: {
    chunk: any;
    nbimFiles: Map<string, File>;
    chunkReadCache: Map<string, ArrayBuffer>;
    chunkReadCacheSize: number;
    chunkReadCacheMB: number;
}) {
    const {
        chunk,
        nbimFiles,
        chunkReadCache,
        chunkReadCacheSize,
        chunkReadCacheMB
    } = options;

    const cacheKey = getChunkReadCacheKey(chunk);
    const cached = chunkReadCache.get(cacheKey);
    if (cached) {
        chunkReadCache.delete(cacheKey);
        chunkReadCache.set(cacheKey, cached);
        return {
            buffer: cached.slice(0),
            chunkReadCacheOrder: Array.from(chunkReadCache.keys())
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
            cacheKey,
            buffer: buffer.slice(0),
            chunkReadCacheSize,
            chunkReadCacheMB
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
