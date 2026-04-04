import { debugWarn } from "../scene/debugLogger";
import { getChunkReadCacheKey, hasValidChunkBinaryRange } from "./chunkIO";

export async function processChunkPrefetchQueue(options: {
    prefetchPaused: boolean;
    isCameraMoving: boolean;
    prefetchQueue: string[];
    prefetchQueueSet: Set<string>;
    prefetchInFlight: Set<string>;
    maxWorkers: number;
    getChunkById: (chunkId: string) => any;
    chunkReadCache: Map<string, ArrayBuffer>;
    readChunkBuffer: (chunk: any) => Promise<ArrayBuffer>;
    processQueue: () => Promise<void> | void;
}) {
    const {
        prefetchPaused,
        isCameraMoving,
        prefetchQueue,
        prefetchQueueSet,
        prefetchInFlight,
        maxWorkers,
        getChunkById,
        chunkReadCache,
        readChunkBuffer,
        processQueue
    } = options;

    if (prefetchPaused || isCameraMoving || prefetchQueue.length === 0) {
        return;
    }

    const maxParallel = Math.max(1, Math.min(4, Math.floor(maxWorkers / 2)));
    while (!prefetchPaused && !isCameraMoving && prefetchQueue.length > 0 && prefetchInFlight.size < maxParallel) {
        const chunkId = prefetchQueue.shift();
        if (!chunkId) break;
        prefetchQueueSet.delete(chunkId);

        const chunk = getChunkById(chunkId);
        if (!chunk || !chunk.nbimFileId || !hasValidChunkBinaryRange(chunk)) {
            continue;
        }

        const cacheKey = getChunkReadCacheKey(chunk);
        if (chunkReadCache.has(cacheKey)) {
            continue;
        }

        prefetchInFlight.add(chunkId);
        void readChunkBuffer(chunk)
            .catch((error) => {
                debugWarn("SceneManager/prefetch", `prefetch failed for ${chunkId}`, error);
            })
            .finally(() => {
                prefetchInFlight.delete(chunkId);
                if (prefetchQueue.length > 0) {
                    void processQueue();
                }
            });
    }
}
