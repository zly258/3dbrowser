import * as THREE from "three";
import type { ChunkRenderPhase, ChunkRuntimeProfileLike } from "./chunkScheduling";

export interface ChunkVisibilityEvaluation {
    shouldSkipSample: boolean;
    shouldBeVisible: boolean;
    effectiveVisible: boolean;
    isPeripheralWhileMoving: boolean;
    shouldRefreshPeripheral: boolean;
    centerPriorityWindow: boolean;
    isPeripheralCandidate: boolean;
    priority: number | null;
    dist: number;
    centrality: number;
    forwardness: number;
    pixelSize: number;
    cacheKey?: string;
}

export function ensureChunkSpatialState(options: {
    chunk: any;
    padding: number;
    tempSize: THREE.Vector3;
}) {
    const { chunk, padding, tempSize } = options;
    if (!chunk.paddedBounds || chunk._padding !== padding) {
        const size = chunk.bounds.getSize(tempSize);
        const paddedBounds = chunk.bounds.clone();
        paddedBounds.expandByVector(size.multiplyScalar(padding));
        chunk.paddedBounds = paddedBounds;
        chunk._padding = padding;
    }
    if (!chunk.center) {
        chunk.center = chunk.bounds.getCenter(new THREE.Vector3());
    }
}

export function evaluateChunkVisibility(options: {
    chunk: any;
    chunkIndex: number;
    totalChunks: number;
    now: number;
    phase: ChunkRenderPhase;
    profile: ChunkRuntimeProfileLike & {
        movingFocusCentralityThreshold: number;
        movingFocusPixelThreshold: number;
        chunkVisibilityHoldMs: number;
        centerPriorityThreshold: number;
        forwardPriorityThreshold: number;
        centerPriorityWindowMs: number;
    };
    performanceMode: "balanced" | "smooth" | "quality";
    isBoxClipped: boolean;
    inFrustum: boolean;
    maxRenderDistance: number;
    cameraPos: THREE.Vector3;
    cameraForward: THREE.Vector3;
    projScreenMatrix: THREE.Matrix4;
    toChunkDirection: THREE.Vector3;
    tempCenterNdc: THREE.Vector3;
    viewHeight: number;
    canvasHeight: number;
    sampleUnloadedWhileMoving: boolean;
    movingSampleStride: number;
    movingSampleSeed: number;
    resolveShouldRefreshPeripheral: (isPeripheralWhileMoving: boolean) => boolean;
    chunkWarmupActive: boolean;
    chunkLoadedCount: number;
    initialChunkLoadTarget: number;
    chunkLoadResumeAt: number;
    chunkMeshCached: boolean;
}) {
    const {
        chunk,
        chunkIndex,
        totalChunks,
        now,
        phase,
        profile,
        performanceMode,
        isBoxClipped,
        maxRenderDistance,
        cameraPos,
        cameraForward,
        projScreenMatrix,
        toChunkDirection,
        tempCenterNdc,
        viewHeight,
        canvasHeight,
        sampleUnloadedWhileMoving,
        movingSampleStride,
        movingSampleSeed,
        resolveShouldRefreshPeripheral,
        chunkWarmupActive,
        chunkLoadedCount,
        initialChunkLoadTarget,
        chunkLoadResumeAt,
        chunkMeshCached
    } = options;

    toChunkDirection.copy(chunk.center).sub(cameraPos);
    const dist = toChunkDirection.length();
    const inRange = dist < maxRenderDistance;

    if (sampleUnloadedWhileMoving && !chunk.loaded && (chunkIndex % movingSampleStride) !== movingSampleSeed) {
        return {
            shouldSkipSample: true,
            shouldBeVisible: false,
            effectiveVisible: false,
            isPeripheralWhileMoving: false,
            shouldRefreshPeripheral: true,
            centerPriorityWindow: false,
            isPeripheralCandidate: false,
            priority: null,
            dist,
            centrality: 0,
            forwardness: 0,
            pixelSize: 0
        };
    }

    const boxSize = chunk.bounds.getSize(new THREE.Vector3()).length();
    const pixelSize = (boxSize / viewHeight) * canvasHeight;
    const centerNdc = tempCenterNdc.copy(chunk.center).applyMatrix4(projScreenMatrix);
    const ndcDistance = Math.sqrt(centerNdc.x * centerNdc.x + centerNdc.y * centerNdc.y);
    const centrality = 1 - Math.min(1, ndcDistance);
    const forwardness = dist > 1e-5
        ? Math.max(0, cameraForward.dot(toChunkDirection.divideScalar(dist)))
        : 1;

    const isTooSmall = pixelSize < 4;
    const shouldHidePeripheralWhileMoving = phase === "moving"
        && centrality < profile.movingFocusCentralityThreshold
        && pixelSize < profile.movingFocusPixelThreshold;

    const shouldBeVisible = options.inFrustum
        && !isBoxClipped
        && inRange
        && !isTooSmall
        && !shouldHidePeripheralWhileMoving;
    const lastTouchedAt = Math.max(chunk.lastVisibleAt || 0, chunk.lastFocusAt || 0);
    const shouldKeepVisibleWhileMoving = phase === "moving"
        && options.inFrustum
        && !isBoxClipped
        && inRange
        && !isTooSmall
        && (now - lastTouchedAt) < profile.chunkVisibilityHoldMs;

    const isPeripheralWhileMoving = centrality < profile.movingCoreCentralityThreshold
        && pixelSize < profile.movingCorePixelThreshold
        && forwardness < profile.movingCoreForwardThreshold;
    const shouldRefreshPeripheral = resolveShouldRefreshPeripheral(isPeripheralWhileMoving);
    const effectiveVisible = phase === "moving" && isPeripheralWhileMoving && !shouldRefreshPeripheral
        ? (chunk.lastEffectiveVisible ?? chunk.mesh?.visible ?? false)
        : (shouldBeVisible || shouldKeepVisibleWhileMoving);
    const centerPriorityWindow = chunkWarmupActive || now < (chunkLoadResumeAt + profile.centerPriorityWindowMs);
    const isPeripheralCandidate = centrality < profile.centerPriorityThreshold
        && forwardness < profile.forwardPriorityThreshold
        && pixelSize < 96;

    let priority: number | null = null;
    if (!chunk.loaded && shouldBeVisible) {
        const viewportBoost = centrality > 0.8 ? 4.5 : centrality > 0.62 ? 2.8 : 1.0;
        const sizeScore = Math.min(8, pixelSize / 120);
        const distanceScore = 1000 / (dist + 1);
        const forwardScore = forwardness * 550;
        const cacheBoost = chunkMeshCached ? 420 : 0;
        const warmupBoost = chunkWarmupActive && chunkLoadedCount < initialChunkLoadTarget
            ? (centrality > 0.65 ? 1500 : centrality > 0.45 ? 500 : 0)
            : 0;
        const movingPriorityBoost = phase === "moving"
            ? (centrality > 0.65 || forwardness > 0.7 ? 900 : centrality > 0.4 ? 250 : -250)
            : 0;

        const shouldSkipForPriority =
            (phase === "moving" && centrality < 0.08 && pixelSize < 18)
            || (phase === "moving" && isPeripheralWhileMoving && !shouldRefreshPeripheral)
            || (phase !== "moving" && centerPriorityWindow && isPeripheralCandidate)
            || (phase === "moving" && performanceMode === "smooth" && centrality < 0.3 && pixelSize < 54 && forwardness < 0.62);

        if (!shouldSkipForPriority) {
            priority = movingPriorityBoost
                + cacheBoost
                + warmupBoost
                + forwardScore
                + (viewportBoost * 1000)
                + (sizeScore * 120)
                + distanceScore
                + (centrality * 300);
        }
    }

    return {
        shouldSkipSample: false,
        shouldBeVisible,
        effectiveVisible,
        isPeripheralWhileMoving,
        shouldRefreshPeripheral,
        centerPriorityWindow,
        isPeripheralCandidate,
        priority,
        dist,
        centrality,
        forwardness,
        pixelSize
    };
}
