export type ChunkRenderPhase = "moving" | "recovery" | "idle";

export interface ChunkRuntimeProfileLike {
    movingCoreCentralityThreshold: number;
    movingCorePixelThreshold: number;
    movingCoreForwardThreshold: number;
    movingPeripheralRefreshMs: number;
    movingPeripheralBatchRatio: number;
    movingPeripheralMinBatchSize: number;
    movingLoadBudgetMin: number;
    movingLoadBudgetMax: number;
    recoveryLoadBudgetMin: number;
    recoveryLoadBudgetMax: number;
    recoveryLoadBudgetRatio: number;
}

export function reportChunkProgressIfNeeded(options: {
    now: number;
    total: number;
    loaded: number;
    lastReportedProgress: { loaded: number; total: number };
    lastChunkProgressReportAt: number;
}) {
    const { now, total, loaded, lastReportedProgress, lastChunkProgressReportAt } = options;
    const changed = loaded !== lastReportedProgress.loaded || total !== lastReportedProgress.total;
    const shouldFlush = total === 0 || (total > 0 && loaded >= total);
    const intervalReached = (now - lastChunkProgressReportAt) >= 48;

    return {
        shouldNotify: changed && (intervalReached || shouldFlush),
        nextProgress: { loaded, total },
        nextReportedAt: shouldFlush || intervalReached ? now : lastChunkProgressReportAt
    };
}

export function selectChunkRuntimeProfile<TProfile>(options: {
    chunkCount: number;
    compact: TProfile;
    balanced: TProfile;
    massive: TProfile;
}) {
    const { chunkCount, compact, balanced, massive } = options;
    if (chunkCount > 2000) return massive;
    if (chunkCount > 600) return balanced;
    return compact;
}

export function computeChunkFrameBudget(options: {
    forceMaxChunkLoadSpeed: boolean;
    maxChunkLoadsPerFrame: number;
    performanceMode: "balanced" | "smooth" | "quality";
    chunkCount: number;
    phase: ChunkRenderPhase;
    profile: ChunkRuntimeProfileLike;
    warmupExtra: number;
}) {
    const {
        forceMaxChunkLoadSpeed,
        maxChunkLoadsPerFrame,
        performanceMode,
        chunkCount,
        phase,
        profile,
        warmupExtra
    } = options;

    if (forceMaxChunkLoadSpeed) {
        return maxChunkLoadsPerFrame + warmupExtra;
    }

    const isHugeScene = chunkCount > 2000;
    const isLargeScene = chunkCount > 600;

    if (phase === "moving") {
        const baseMovingBudget = Math.max(
            profile.movingLoadBudgetMin,
            Math.min(profile.movingLoadBudgetMax, Math.floor(maxChunkLoadsPerFrame / 4))
        );

        if (performanceMode === "smooth") {
            if (isHugeScene) return Math.max(1, Math.floor(baseMovingBudget * 0.35));
            if (isLargeScene) return Math.max(1, Math.floor(baseMovingBudget * 0.5));
            return Math.max(1, Math.floor(baseMovingBudget * 0.7));
        }

        if (isHugeScene) return Math.max(1, Math.floor(baseMovingBudget * 0.55));
        if (isLargeScene) return Math.max(1, Math.floor(baseMovingBudget * 0.75));
        return baseMovingBudget;
    }

    if (phase === "recovery") {
        const recoveryBudget = Math.max(
            profile.recoveryLoadBudgetMin,
            Math.min(
                profile.recoveryLoadBudgetMax,
                Math.floor(maxChunkLoadsPerFrame * profile.recoveryLoadBudgetRatio)
            )
        );
        const recoveryBoost = performanceMode === "smooth" ? Math.max(2, Math.floor(recoveryBudget * 0.6)) : 0;
        return recoveryBudget + recoveryBoost + warmupExtra;
    }

    return maxChunkLoadsPerFrame + warmupExtra;
}

export function isMovingPeripheralChunk(options: {
    centrality: number;
    pixelSize: number;
    forwardness: number;
    profile: ChunkRuntimeProfileLike;
}) {
    const { centrality, pixelSize, forwardness, profile } = options;
    return centrality < profile.movingCoreCentralityThreshold
        && pixelSize < profile.movingCorePixelThreshold
        && forwardness < profile.movingCoreForwardThreshold;
}

export function updatePeripheralRefreshWindow(options: {
    now: number;
    isCameraMoving: boolean;
    chunkIndex: number;
    totalChunks: number;
    profile: ChunkRuntimeProfileLike;
    movingPeripheralCursor: number;
    movingPeripheralLastRefreshAt: number;
}) {
    const {
        now,
        isCameraMoving,
        chunkIndex,
        totalChunks,
        profile,
        movingPeripheralCursor,
        movingPeripheralLastRefreshAt
    } = options;

    if (!isCameraMoving || totalChunks === 0) {
        return {
            shouldRefresh: true,
            movingPeripheralCursor,
            movingPeripheralLastRefreshAt
        };
    }

    let nextCursor = movingPeripheralCursor;
    let nextLastRefreshAt = movingPeripheralLastRefreshAt;

    if (now - nextLastRefreshAt >= profile.movingPeripheralRefreshMs) {
        const batchSize = Math.min(
            totalChunks,
            Math.max(profile.movingPeripheralMinBatchSize, Math.ceil(totalChunks * profile.movingPeripheralBatchRatio))
        );
        nextCursor = (nextCursor + batchSize) % totalChunks;
        nextLastRefreshAt = now;
    }

    const batchSize = Math.min(
        totalChunks,
        Math.max(profile.movingPeripheralMinBatchSize, Math.ceil(totalChunks * profile.movingPeripheralBatchRatio))
    );
    const start = nextCursor;
    const end = start + batchSize;
    const shouldRefresh = end <= totalChunks
        ? chunkIndex >= start && chunkIndex < end
        : chunkIndex >= start || chunkIndex < (end % totalChunks);

    return {
        shouldRefresh,
        movingPeripheralCursor: nextCursor,
        movingPeripheralLastRefreshAt: nextLastRefreshAt
    };
}
