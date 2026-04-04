import * as THREE from "three";

export function disposeChunkMeshResource(options: {
    mesh: THREE.BatchedMesh;
    sharedMaterial: THREE.Material;
}) {
    const { mesh, sharedMaterial } = options;
    if (mesh.geometry) {
        mesh.geometry.dispose();
    }
    if (mesh.material && mesh.material !== sharedMaterial) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material: any) => material.dispose && material.dispose());
    }
}

export function touchChunkMeshCacheOrder(chunkCacheOrder: string[], chunkId: string) {
    return [...chunkCacheOrder.filter((id) => id !== chunkId), chunkId];
}

export function cacheChunkMeshEntry(options: {
    chunk: any;
    mesh: THREE.BatchedMesh;
    chunkMeshCache: Map<string, THREE.BatchedMesh>;
    chunkCacheOrder: string[];
    maxCachedChunks: number;
    disposeChunkMesh: (mesh: THREE.BatchedMesh) => void;
}) {
    const {
        chunk,
        mesh,
        chunkMeshCache,
        chunkCacheOrder,
        maxCachedChunks,
        disposeChunkMesh
    } = options;

    if (chunkMeshCache.has(chunk.id)) {
        const oldMesh = chunkMeshCache.get(chunk.id)!;
        if (oldMesh !== mesh) {
            disposeChunkMesh(oldMesh);
        }
    }
    chunkMeshCache.set(chunk.id, mesh);
    let nextChunkCacheOrder = touchChunkMeshCacheOrder(chunkCacheOrder, chunk.id);

    while (nextChunkCacheOrder.length > maxCachedChunks) {
        const evictId = nextChunkCacheOrder.shift();
        if (!evictId) break;
        const cached = chunkMeshCache.get(evictId);
        if (!cached) continue;
        chunkMeshCache.delete(evictId);
        disposeChunkMesh(cached);
    }

    return {
        chunkMeshCache,
        chunkCacheOrder: nextChunkCacheOrder
    };
}

export function takeCachedChunkMeshEntry(options: {
    chunkId: string;
    chunkMeshCache: Map<string, THREE.BatchedMesh>;
    chunkCacheOrder: string[];
}) {
    const { chunkId, chunkMeshCache, chunkCacheOrder } = options;
    const mesh = chunkMeshCache.get(chunkId) || null;
    if (!mesh) {
        return {
            mesh: null,
            chunkCacheOrder
        };
    }
    chunkMeshCache.delete(chunkId);
    return {
        mesh,
        chunkCacheOrder: chunkCacheOrder.filter((id) => id !== chunkId)
    };
}

export function clearChunkMeshCacheEntries(options: {
    chunkMeshCache: Map<string, THREE.BatchedMesh>;
    chunkCacheOrder: string[];
    disposeChunkMesh: (mesh: THREE.BatchedMesh) => void;
    filter?: (chunkId: string, mesh: THREE.BatchedMesh) => boolean;
}) {
    const { chunkMeshCache, chunkCacheOrder, disposeChunkMesh, filter } = options;

    for (const [chunkId, mesh] of chunkMeshCache.entries()) {
        if (filter && !filter(chunkId, mesh)) continue;
        disposeChunkMesh(mesh);
        chunkMeshCache.delete(chunkId);
    }

    return chunkCacheOrder.filter((chunkId) => chunkMeshCache.has(chunkId));
}

export function unregisterOptimizedMeshResourceMapping(options: {
    mesh: THREE.BatchedMesh;
    optimizedMapping: Map<string, any[]>;
}) {
    const { mesh, optimizedMapping } = options;
    const batchIdToUuid = mesh.userData.batchIdToUuid as Map<number, string>;
    if (!batchIdToUuid) return;

    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
        const mapping = optimizedMapping.get(originalUuid);
        if (!mapping) continue;
        const index = mapping.findIndex((item) => item.mesh === mesh && item.instanceId === batchId);
        if (index !== -1) {
            mapping.splice(index, 1);
        }
        if (mapping.length === 0) {
            optimizedMapping.delete(originalUuid);
        }
    }
}

export function registerOptimizedMeshResourceMapping(options: {
    mesh: THREE.BatchedMesh;
    optimizedMapping: Map<string, any[]>;
}) {
    const { mesh, optimizedMapping } = options;
    const batchIdToUuid = mesh.userData.batchIdToUuid as Map<number, string>;
    const batchIdToColor = mesh.userData.batchIdToColor as Map<number, number>;
    const batchIdToGeometry = mesh.userData.batchIdToGeometry as Map<number, THREE.BufferGeometry>;

    if (!batchIdToUuid) return;

    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
        if (!optimizedMapping.has(originalUuid)) {
            optimizedMapping.set(originalUuid, []);
        }
        const originalColor = batchIdToColor?.get(batchId) ?? 0xffffff;
        const geometry = batchIdToGeometry?.get(batchId);
        optimizedMapping.get(originalUuid)!.push({
            mesh,
            instanceId: batchId,
            originalColor,
            geometry
        });
    }
}

export function acquireGhostLineResource(options: {
    ghostMeshPool: THREE.LineSegments[];
    ghostEdgesGeometry: THREE.BufferGeometry;
    ghostMaterial: THREE.Material;
}) {
    const { ghostMeshPool, ghostEdgesGeometry, ghostMaterial } = options;
    const reused = ghostMeshPool.pop();
    if (reused) {
        reused.visible = true;
        return reused;
    }
    return new THREE.LineSegments(ghostEdgesGeometry, ghostMaterial);
}

export function releaseGhostLineResource(options: {
    line: THREE.LineSegments;
    ghostMeshPool: THREE.LineSegments[];
}) {
    const { line, ghostMeshPool } = options;
    line.visible = false;
    line.name = "";
    line.scale.set(1, 1, 1);
    line.position.set(0, 0, 0);
    if (line.material instanceof THREE.LineBasicMaterial) {
        line.material.opacity = 0.3;
    }
    ghostMeshPool.push(line);
}

export function createGhostLineResource(options: {
    name: string;
    bounds: THREE.Box3;
    acquireGhostLine: () => THREE.LineSegments;
}) {
    const { name, bounds, acquireGhostLine } = options;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const edges = acquireGhostLine();
    edges.name = name;
    edges.scale.copy(size);
    edges.position.copy(center);
    return edges;
}

export function ensureChunkGhostResource(options: {
    chunk: any;
    ghostGroup: THREE.Group;
    createGhostLine: (name: string, bounds: THREE.Box3) => THREE.LineSegments;
}) {
    const { chunk, ghostGroup, createGhostLine } = options;
    if (ghostGroup.getObjectByName(`ghost_${chunk.id}`)) {
        return;
    }
    const edges = createGhostLine(`ghost_${chunk.id}`, chunk.bounds);
    ghostGroup.add(edges);
}
