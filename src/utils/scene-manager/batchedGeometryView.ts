import * as THREE from "three";

/**
 * 逐实例几何的按需视图。
 *
 * BatchedMesh 的合并缓冲本身已经持有全部顶点/法线；早期为了拾取/边线/面积/发光，
 * 又给每个“唯一几何”复制了一份 position/normal + 重定基索引（全模型 500MB+）。
 * 现在改为：
 *  - 只有真正需要几何的消费方（边线、碰撞、面积/体积、发光）才调用本模块；
 *  - 视图的 position/normal 是合并缓冲的 subarray（零拷贝），只有索引需要重定基复制；
 *  - 视图按 geometryId 缓存在 mesh 上，边线构建完可整体释放。
 *
 * LMB 路径（octree 批量网格）仍然持有原始几何的 batchIdToGeometry，这里优先复用。
 */

const VIEW_CACHE_KEY = "__geometryViews";

function getViewCache(mesh: THREE.BatchedMesh): Map<number, THREE.BufferGeometry> {
    const userData = mesh.userData || (mesh.userData = {});
    return (userData[VIEW_CACHE_KEY] ||= new Map<number, THREE.BufferGeometry>()) as Map<number, THREE.BufferGeometry>;
}

export function getBatchedGeometryId(mesh: THREE.BatchedMesh, instanceId: number): number | null {
    const getGeometryIdAt = (mesh as any).getGeometryIdAt;
    if (typeof getGeometryIdAt !== "function") return null;
    try {
        const id = getGeometryIdAt.call(mesh, instanceId);
        return typeof id === "number" && id >= 0 ? id : null;
    } catch {
        return null;
    }
}

function buildView(mesh: THREE.BatchedMesh, geometryId: number): THREE.BufferGeometry | null {
    const getRange = (mesh as any).getGeometryRangeAt;
    if (typeof getRange !== "function") return null;

    let range: any;
    try {
        range = getRange.call(mesh, geometryId, {});
    } catch {
        return null;
    }
    if (!range || !(range.vertexCount > 0)) return null;

    const merged = mesh.geometry;
    const mergedPosition = merged.getAttribute("position") as THREE.BufferAttribute | undefined;
    const mergedNormal = merged.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const mergedIndex = merged.getIndex();
    if (!mergedPosition) return null;

    const view = new THREE.BufferGeometry();
    const start = range.vertexStart;
    const count = range.vertexCount;
    view.setAttribute(
        "position",
        new THREE.BufferAttribute((mergedPosition.array as Float32Array).subarray(start * 3, (start + count) * 3), 3)
    );
    if (mergedNormal) {
        view.setAttribute(
            "normal",
            new THREE.BufferAttribute((mergedNormal.array as Float32Array).subarray(start * 3, (start + count) * 3), 3)
        );
    }
    if (mergedIndex && range.indexCount > 0) {
        const source = mergedIndex.array as Uint32Array | Uint16Array;
        const rebased = new Uint32Array(range.indexCount);
        for (let i = 0; i < range.indexCount; i++) {
            rebased[i] = source[range.indexStart + i] - start;
        }
        view.setIndex(new THREE.BufferAttribute(rebased, 1));
    }
    view.computeBoundingBox();
    return view;
}

export function getBatchedGeometryViewByGeometryId(mesh: THREE.BatchedMesh, geometryId: number): THREE.BufferGeometry | null {
    const cache = getViewCache(mesh);
    const cached = cache.get(geometryId);
    if (cached) return cached;
    const view = buildView(mesh, geometryId);
    if (view) cache.set(geometryId, view);
    return view;
}

/** 取某个实例对应的几何：LMB 用原始几何，NBIM 按需从合并缓冲构建视图。 */
export function getBatchedInstanceGeometry(mesh: THREE.BatchedMesh, instanceId: number): THREE.BufferGeometry | null {
    const legacy = mesh.userData?.batchIdToGeometry as Map<number, THREE.BufferGeometry> | undefined;
    if (legacy) {
        const geometry = legacy.get(instanceId);
        if (geometry) return geometry;
    }
    const geometryId = getBatchedGeometryId(mesh, instanceId);
    return geometryId === null ? null : getBatchedGeometryViewByGeometryId(mesh, geometryId);
}

/** 实例几何在 mesh 局部空间的包围盒（不创建视图）。 */
export function getBatchedInstanceLocalBox(
    mesh: THREE.BatchedMesh,
    instanceId: number,
    target = new THREE.Box3()
): THREE.Box3 | null {
    const geometryId = getBatchedGeometryId(mesh, instanceId);
    if (geometryId !== null) {
        const getBoundingBoxAt = (mesh as any).getBoundingBoxAt;
        if (typeof getBoundingBoxAt === "function") {
            const box = getBoundingBoxAt.call(mesh, geometryId, target);
            if (box && !box.isEmpty()) return target;
        }
    }
    const geometry = getBatchedInstanceGeometry(mesh, instanceId);
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return null;
    return target.copy(geometry.boundingBox);
}

/** 实例几何的世界包围盒（仅矩阵变换，不创建视图）。 */
export function getBatchedInstanceWorldBox(
    mesh: THREE.BatchedMesh,
    instanceId: number,
    target = new THREE.Box3(),
    matrix = new THREE.Matrix4()
): THREE.Box3 | null {
    const local = getBatchedInstanceLocalBox(mesh, instanceId, target);
    if (!local) return null;
    mesh.getMatrixAt(instanceId, matrix);
    matrix.premultiply(mesh.matrixWorld);
    return target.applyMatrix4(matrix);
}

export function getBatchedGeometryViewStats(mesh: THREE.BatchedMesh) {
    let count = 0;
    let bytes = 0;
    const cache = mesh.userData?.[VIEW_CACHE_KEY] as Map<number, THREE.BufferGeometry> | undefined;
    if (cache) {
        count = cache.size;
        for (const view of cache.values()) {
            const index = view.getIndex();
            const indexArray = index?.array as ArrayLike<number> | undefined;
            if (indexArray && typeof (indexArray as any).byteLength === "number") {
                bytes += (indexArray as any).byteLength;
            }
        }
    }
    const legacy = mesh.userData?.batchIdToGeometry as Map<number, THREE.BufferGeometry> | undefined;
    if (legacy) {
        const seen = new Set<THREE.BufferGeometry>();
        for (const geometry of legacy.values()) {
            if (!geometry || seen.has(geometry)) continue;
            seen.add(geometry);
            const position = geometry.getAttribute?.("position") as THREE.BufferAttribute | undefined;
            if (position?.array?.byteLength) bytes += (position.array as any).byteLength;
            const normal = geometry.getAttribute?.("normal") as THREE.BufferAttribute | undefined;
            if (normal?.array?.byteLength) bytes += (normal.array as any).byteLength;
            const index = geometry.getIndex();
            if (index?.array?.byteLength) bytes += (index.array as any).byteLength;
        }
        count += seen.size;
    }
    return { count, bytes };
}

/** 释放某个批量网格的全部按需视图（边线构建完、卸载分块时调用）。 */
export function clearBatchedGeometryViews(mesh: THREE.BatchedMesh) {
    const cache = mesh.userData?.[VIEW_CACHE_KEY] as Map<number, THREE.BufferGeometry> | undefined;
    if (!cache) return;
    for (const view of cache.values()) {
        view.dispose();
    }
    cache.clear();
}