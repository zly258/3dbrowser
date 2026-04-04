import type { ChunkRenderPhase, ChunkRuntimeProfileLike } from "./chunkScheduling";

export function selectChunksToUnload(options: {
    isCameraMoving: boolean;
    loadedChunks: any[];
    maxLoadedChunks: number;
    cameraPos: { distanceToSquared(target: any): number };
    now: number;
    chunkResidencyMs: number;
}) {
    const {
        isCameraMoving,
        loadedChunks,
        maxLoadedChunks,
        cameraPos,
        now,
        chunkResidencyMs
    } = options;

    if (isCameraMoving || loadedChunks.length <= maxLoadedChunks) {
        return [];
    }

    const sortedChunks = [...loadedChunks].sort(
        (a, b) => b.center.distanceToSquared(cameraPos) - a.center.distanceToSquared(cameraPos)
    );

    const targetUnload = sortedChunks.length - maxLoadedChunks;
    const unloadTargets: any[] = [];

    for (const chunk of sortedChunks) {
        if (unloadTargets.length >= targetUnload) {
            break;
        }

        const lastTouchedAt = Math.max(chunk.lastVisibleAt || 0, chunk.lastFocusAt || 0);
        if ((now - lastTouchedAt) < chunkResidencyMs) {
            continue;
        }
        if (!chunk.mesh || !chunk.mesh.visible) {
            unloadTargets.push(chunk);
        }
    }

    return unloadTargets;
}

export function planChunkLoads<TProfile extends ChunkRuntimeProfileLike>(options: {
    toLoad: any[];
    now: number;
    chunkLoadResumeAt: number;
    maxConcurrentChunkLoads: number;
    processingChunkCount: number;
    chunkWarmupActive: boolean;
    chunkLoadedCount: number;
    initialChunkLoadTarget: number;
    warmupChunkBoost: number;
    getChunkFrameBudget: (phase: ChunkRenderPhase, profile: TProfile, warmupExtra: number) => number;
    phase: ChunkRenderPhase;
    profile: TProfile;
}) {
    const {
        toLoad,
        now,
        chunkLoadResumeAt,
        maxConcurrentChunkLoads,
        processingChunkCount,
        chunkWarmupActive,
        chunkLoadedCount,
        initialChunkLoadTarget,
        warmupChunkBoost,
        getChunkFrameBudget,
        phase,
        profile
    } = options;

    if (toLoad.length === 0 || now < chunkLoadResumeAt) {
        return [];
    }

    const sortedChunks = [...toLoad].sort((a, b) => b.priority - a.priority);
    const available = maxConcurrentChunkLoads - processingChunkCount;
    if (available <= 0) {
        return [];
    }

    const warmupExtra = chunkWarmupActive && chunkLoadedCount < initialChunkLoadTarget
        ? warmupChunkBoost
        : 0;
    const frameBudget = getChunkFrameBudget(phase, profile, warmupExtra);
    const count = Math.min(available, frameBudget, sortedChunks.length);

    return sortedChunks.slice(0, count);
}
