import * as THREE from "three";
import type { StructureTreeNode } from "./types";
import { countStructureRenderableNodes } from "./nbim";

export function applyNbimGlobalBounds(options: {
    globalBounds?: {
        min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number };
    };
    precomputedBounds: THREE.Box3;
    sceneBounds: THREE.Box3;
    globalOffset: THREE.Vector3;
}) {
    const { globalBounds, precomputedBounds, sceneBounds, globalOffset } = options;
    if (!globalBounds) {
        return {
            precomputedBounds,
            sceneBounds,
            globalOffset,
            initializedOffset: false
        };
    }

    const newBounds = new THREE.Box3(
        new THREE.Vector3(globalBounds.min.x, globalBounds.min.y, globalBounds.min.z),
        new THREE.Vector3(globalBounds.max.x, globalBounds.max.y, globalBounds.max.z)
    );

    let initializedOffset = false;
    const nextGlobalOffset = globalOffset.clone();
    if (nextGlobalOffset.length() === 0) {
        newBounds.getCenter(nextGlobalOffset);
        initializedOffset = true;
    }

    const nextPrecomputedBounds = precomputedBounds.clone();
    if (nextPrecomputedBounds.isEmpty()) {
        nextPrecomputedBounds.copy(newBounds);
    } else {
        nextPrecomputedBounds.union(newBounds);
    }

    return {
        precomputedBounds: nextPrecomputedBounds,
        sceneBounds: nextPrecomputedBounds.clone(),
        globalOffset: nextGlobalOffset,
        initializedOffset
    };
}

export function appendNbimStructure(options: {
    structureRoot: StructureTreeNode;
    modelRoot?: StructureTreeNode;
}) {
    const { structureRoot, modelRoot } = options;
    if (!structureRoot.children) structureRoot.children = [];
    if (!modelRoot) return structureRoot;

    if (modelRoot.children && modelRoot.name === "Root") {
        structureRoot.children.push(...modelRoot.children);
    } else {
        structureRoot.children.push(modelRoot);
    }

    return structureRoot;
}

export function buildNbimQuickStats(options: {
    manifestStats?: { meshes: number; faces: number; memory: number };
    modelRoot?: StructureTreeNode;
    chunks?: Array<{ byteLength?: number }>;
}) {
    const { manifestStats, modelRoot, chunks } = options;
    return manifestStats || {
        meshes: countStructureRenderableNodes(modelRoot),
        faces: 0,
        memory: parseFloat((((chunks || []).reduce((sum, chunk) => sum + (chunk.byteLength || 0), 0)) / (1024 * 1024)).toFixed(2))
    };
}

export function populateNbimNodeMappings(options: {
    modelRoot?: StructureTreeNode;
    defaultOwner: string;
    nodeMap: Map<string, StructureTreeNode[]>;
    bimIdToNodeIds: Map<string, string[]>;
}) {
    const { modelRoot, defaultOwner, nodeMap, bimIdToNodeIds } = options;
    if (!modelRoot) return;

    const traverse = (node: StructureTreeNode) => {
        if (!node.userData) node.userData = {};
        const nodeOriginalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : defaultOwner;
        node.userData.originalUuid = nodeOriginalUuid;
        if (!nodeMap.has(node.id)) nodeMap.set(node.id, []);
        nodeMap.get(node.id)!.push(node);

        if (node.bimId) {
            const key = `${nodeOriginalUuid}::${node.bimId}`;
            if (!bimIdToNodeIds.has(key)) bimIdToNodeIds.set(key, []);
            bimIdToNodeIds.get(key)!.push(node.id);
        }

        if (node.children) node.children.forEach(traverse);
    };

    traverse(modelRoot);
}

export async function registerNbimChunks(options: {
    chunkEntries: any[];
    globalOffset: THREE.Vector3;
    chunkPadding: number;
    rootId: string;
    fileId: string;
    immediateGhostLimit: number;
    registrationBatchSize: number;
    onProgress?: (p: number, msg: string) => void;
    registerChunk: (chunk: any) => void;
    createGhostLine: (name: string, bounds: THREE.Box3) => THREE.LineSegments;
    addGhostLine: (line: THREE.LineSegments) => void;
    yieldToMainThread: () => Promise<void>;
}) {
    const {
        chunkEntries,
        globalOffset,
        chunkPadding,
        rootId,
        fileId,
        immediateGhostLimit,
        registrationBatchSize,
        onProgress,
        registerChunk,
        createGhostLine,
        addGhostLine,
        yieldToMainThread
    } = options;

    if (chunkEntries.length === 0) {
        throw new Error("NBIM 文件没有可渲染分块，可能格式有问题");
    }

    const chunkOffset = globalOffset.lengthSq() > 0 ? globalOffset.clone().negate() : null;
    const deferredGhostSpecs: Array<{ chunkId: string; bounds: THREE.Box3 }> = [];

    for (let index = 0; index < chunkEntries.length; index++) {
        const chunkEntry = chunkEntries[index];
        if (!chunkEntry?.bounds || typeof chunkEntry.byteOffset !== "number" || typeof chunkEntry.byteLength !== "number") {
            throw new Error("NBIM 分块数据不完整，可能格式有问题");
        }

        const bounds = new THREE.Box3(
            new THREE.Vector3(chunkEntry.bounds.min.x, chunkEntry.bounds.min.y, chunkEntry.bounds.min.z),
            new THREE.Vector3(chunkEntry.bounds.max.x, chunkEntry.bounds.max.y, chunkEntry.bounds.max.z)
        );

        if (chunkOffset) {
            bounds.translate(chunkOffset);
        }

        const chunkId = chunkEntry.id;
        const center = bounds.getCenter(new THREE.Vector3());
        const paddedBounds = bounds.clone();
        const padSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(chunkPadding);
        paddedBounds.expandByVector(padSize);

        registerChunk({
            id: chunkId,
            bounds,
            paddedBounds,
            _padding: chunkPadding,
            center,
            loaded: false,
            byteOffset: chunkEntry.byteOffset,
            byteLength: chunkEntry.byteLength,
            nbimFileId: fileId,
            groupName: `optimized_${rootId}`,
            originalUuid: chunkEntry.originalUuid ? String(chunkEntry.originalUuid) : rootId
        });

        if (index < immediateGhostLimit) {
            addGhostLine(createGhostLine(`ghost_${chunkId}`, bounds));
        } else {
            deferredGhostSpecs.push({ chunkId, bounds });
        }

        if ((index + 1) % registrationBatchSize === 0) {
            if (onProgress) {
                const ratio = Math.max(0, Math.min(1, (index + 1) / chunkEntries.length));
                onProgress(30 + Math.round(ratio * 40), "正在初始化分块...");
            }
            await yieldToMainThread();
        }
    }

    return {
        deferredGhostSpecs
    };
}

export function finalizeNbimLoad(options: {
    chunkCount: number;
    hasManifestStats: boolean;
    hasManifestChunks: boolean;
}) {
    const { chunkCount, hasManifestStats, hasManifestChunks } = options;

    return {
        chunkWarmupActive: true,
        initialChunkLoadTarget: chunkCount > 200 ? 44 : chunkCount > 80 ? 30 : 16,
        shouldEstimateStats: !hasManifestStats && hasManifestChunks
    };
}

