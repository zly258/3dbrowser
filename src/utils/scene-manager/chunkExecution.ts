import * as THREE from "three";
import { createBatchedMeshFromItemsAsync } from "../octree";

export function applyUnloadChunk(options: {
    chunk: any;
    unregisterOptimizedMeshMapping: (mesh: THREE.BatchedMesh) => void;
    cacheChunkMesh: (chunk: any, mesh: THREE.BatchedMesh) => void;
    ensureChunkGhost: (chunk: any) => void;
}) {
    const { chunk, unregisterOptimizedMeshMapping, cacheChunkMesh, ensureChunkGhost } = options;
    if (!chunk.loaded || !chunk.mesh) {
        return {
            changed: false,
            chunkLoadedCountDelta: 0
        };
    }

    const mesh = chunk.mesh as THREE.BatchedMesh;
    unregisterOptimizedMeshMapping(mesh);

    if (mesh.parent) {
        mesh.parent.remove(mesh);
    }
    cacheChunkMesh(chunk, mesh);
    ensureChunkGhost(chunk);

    chunk.mesh = null;
    chunk.loaded = false;

    return {
        changed: true,
        chunkLoadedCountDelta: -1
    };
}

export async function resolveChunkMeshForLoad(options: {
    chunk: any;
    sharedMaterial: THREE.Material;
    takeCachedChunkMesh: (chunkId: string) => THREE.BatchedMesh | null;
    yieldToMainThread: () => Promise<void>;
    nbimFiles: Map<string, File>;
    hasValidChunkBinaryRange: (chunk: any) => boolean;
    readChunkBuffer: (chunk: any) => Promise<ArrayBuffer>;
    nbimMeta: Map<string, any>;
    runWorkerTask: (data: any, transferables: any[]) => Promise<any>;
    reconstructBatchedMesh: (data: any, material: THREE.Material) => THREE.BatchedMesh | null;
    isCameraMoving: boolean;
    chunkPrefetchWindow: number;
    getChunkIndex: (chunkId: string) => number;
    chunks: any[];
    processingChunks: Set<string>;
}) {
    const {
        chunk,
        sharedMaterial,
        takeCachedChunkMesh,
        yieldToMainThread,
        nbimFiles,
        hasValidChunkBinaryRange,
        readChunkBuffer,
        nbimMeta,
        runWorkerTask,
        reconstructBatchedMesh,
        isCameraMoving,
        chunkPrefetchWindow,
        getChunkIndex,
        chunks,
        processingChunks
    } = options;

    const cachedMesh = takeCachedChunkMesh(chunk.id);
    if (cachedMesh) {
        return { mesh: cachedMesh, prefetchCandidates: [] as string[] };
    }

    if (chunk.node) {
        const mesh = await createBatchedMeshFromItemsAsync(chunk.node.items, sharedMaterial, {
            batchSize: 1200,
            yieldControl: () => yieldToMainThread()
        });
        return { mesh, prefetchCandidates: [] as string[] };
    }

    if (chunk.nbimFileId && nbimFiles.has(chunk.nbimFileId) && hasValidChunkBinaryRange(chunk)) {
        const buffer = await readChunkBuffer(chunk);
        const meta = nbimMeta.get(chunk.nbimFileId);
        const version = meta?.version ?? 8;
        if (version !== 8) {
            throw new Error(`Unsupported NBIM version: ${version}. Only V8 is supported.`);
        }

        const workerResult = await runWorkerTask({
            buffer,
            version,
            originalUuid: chunk.originalUuid,
            bimIdTable: meta?.bimIdTable
        }, [buffer]);

        const mesh = reconstructBatchedMesh(workerResult, sharedMaterial);
        const prefetchCandidates: string[] = [];

        if (!isCameraMoving && chunkPrefetchWindow > 0) {
            const chunkIndex = getChunkIndex(chunk.id);
            if (chunkIndex >= 0) {
                for (let i = 1; i <= chunkPrefetchWindow; i++) {
                    const next = chunks[chunkIndex + i];
                    if (!next) break;
                    if (next.loaded || processingChunks.has(next.id)) continue;
                    if (!next.nbimFileId || !hasValidChunkBinaryRange(next)) continue;
                    prefetchCandidates.push(next.id);
                }
            }
        }

        return { mesh, prefetchCandidates };
    }

    return { mesh: null, prefetchCandidates: [] as string[] };
}

export function attachLoadedChunkMesh(options: {
    chunk: any;
    mesh: THREE.BatchedMesh;
    cancelledChunkIds: Set<string>;
    chunkIdSet: Set<string>;
    disposeChunkMesh: (mesh: THREE.BatchedMesh) => void;
    globalOffset: THREE.Vector3;
    contentGroup: THREE.Group;
    registerOptimizedMeshMapping: (mesh: THREE.BatchedMesh) => void;
}) {
    const {
        chunk,
        mesh,
        cancelledChunkIds,
        chunkIdSet,
        disposeChunkMesh,
        globalOffset,
        contentGroup,
        registerOptimizedMeshMapping
    } = options;

    if (cancelledChunkIds.has(chunk.id) || !chunkIdSet.has(chunk.id)) {
        disposeChunkMesh(mesh);
        return { attached: false };
    }

    mesh.name = chunk.id;
    mesh.userData.chunkId = chunk.id;
    mesh.userData.originalUuid = chunk.originalUuid;

    if (chunk.nbimFileId) {
        mesh.position.sub(globalOffset);
        mesh.updateMatrixWorld(true);
    }

    let optimizedGroup = contentGroup.getObjectByName(chunk.groupName) as THREE.Group;
    if (!optimizedGroup) {
        optimizedGroup = new THREE.Group();
        optimizedGroup.name = chunk.groupName;
        optimizedGroup.userData.isOptimizedGroup = true;
        optimizedGroup.userData.originalUuid = chunk.originalUuid;
        contentGroup.add(optimizedGroup);
    }

    optimizedGroup.add(mesh);
    chunk.mesh = mesh;
    registerOptimizedMeshMapping(mesh);

    return { attached: true };
}

export function finalizeLoadedChunk(options: {
    chunk: any;
    loadedNow: boolean;
    now: number;
    chunkLoadedCount: number;
    chunkWarmupActive: boolean;
    initialChunkLoadTarget: number;
    deactivateFastPreviewForModel: (originalUuid: string) => void;
}) {
    const {
        chunk,
        loadedNow,
        now,
        chunkLoadedCount,
        chunkWarmupActive,
        initialChunkLoadTarget,
        deactivateFastPreviewForModel
    } = options;

    let nextChunkLoadedCount = chunkLoadedCount;
    let nextChunkWarmupActive = chunkWarmupActive;
    let progressChanged = false;

    if (loadedNow && !chunk.loaded) {
        chunk.loaded = true;
        nextChunkLoadedCount++;
        chunk.lastVisibleAt = now;
        chunk.lastFocusAt = now;
        if (chunk.originalUuid) {
            deactivateFastPreviewForModel(chunk.originalUuid);
        }
        if (nextChunkWarmupActive && nextChunkLoadedCount >= initialChunkLoadTarget) {
            nextChunkWarmupActive = false;
        }
        progressChanged = true;
    }

    return {
        nextChunkLoadedCount,
        nextChunkWarmupActive,
        progressChanged
    };
}

export function cleanupChunkGhost(options: {
    chunkId: string;
    ghostGroup: THREE.Group;
    releaseGhostLine: (line: THREE.LineSegments) => void;
}) {
    const { chunkId, ghostGroup, releaseGhostLine } = options;
    const ghost = ghostGroup.getObjectByName(`ghost_${chunkId}`);
    if (!ghost) {
        return;
    }
    ghostGroup.remove(ghost);
    releaseGhostLine(ghost as THREE.LineSegments);
}
