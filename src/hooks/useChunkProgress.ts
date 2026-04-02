import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

interface ChunkProgressValue {
    loaded: number;
    total: number;
}

interface ChunkProgressHookOptions {
    fileSetIdRef: RefObject<string>;
    completedFileSetsRef: RefObject<Set<string>>;
    onProgress: (next: ChunkProgressValue | ((prev: ChunkProgressValue) => ChunkProgressValue)) => void;
    onCompleted: () => void;
}

export function useChunkProgress({
    fileSetIdRef,
    completedFileSetsRef,
    onProgress,
    onCompleted
}: ChunkProgressHookOptions) {
    const chunkProgressRafRef = useRef<number | null>(null);
    const pendingChunkProgressRef = useRef<ChunkProgressValue | null>(null);

    const flushChunkProgress = useCallback(() => {
        chunkProgressRafRef.current = null;
        const pending = pendingChunkProgressRef.current;
        if (!pending) return;
        pendingChunkProgressRef.current = null;

        const { loaded, total } = pending;
        onProgress((prev) => {
            if (prev.loaded === loaded && prev.total === total) return prev;
            return { loaded, total };
        });

        const fileSetId = fileSetIdRef.current;
        if (loaded === total && total > 0 && fileSetId) {
            if (!completedFileSetsRef.current.has(fileSetId)) {
                completedFileSetsRef.current.add(fileSetId);
                onCompleted();
            }
        }
    }, [completedFileSetsRef, fileSetIdRef, onCompleted, onProgress]);

    const onManagerChunkProgress = useCallback((loaded: number, total: number) => {
        pendingChunkProgressRef.current = { loaded, total };
        if (chunkProgressRafRef.current === null) {
            chunkProgressRafRef.current = requestAnimationFrame(flushChunkProgress);
        }
    }, [flushChunkProgress]);

    useEffect(() => {
        return () => {
            if (chunkProgressRafRef.current !== null) {
                cancelAnimationFrame(chunkProgressRafRef.current);
                chunkProgressRafRef.current = null;
            }
            pendingChunkProgressRef.current = null;
        };
    }, []);

    return { onManagerChunkProgress };
}
