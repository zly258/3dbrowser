import * as THREE from "three";
import type { StructureTreeNode } from "./types";

export type OptimizedMappingEntry = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
    geometry?: THREE.BufferGeometry;
};

export type RenderTarget = {
    key: string;
    uuid: string;
    name: string;
    object: THREE.Object3D;
    geometry: THREE.BufferGeometry;
    matrixWorld: THREE.Matrix4;
    box: THREE.Box3;
    type: "mesh" | "instance";
    ownerUuid?: string;
    batchedMesh?: THREE.BatchedMesh;
    instanceId?: number;
    originalColor?: number;
};

export interface RenderTargetContext {
    contentGroup: THREE.Group;
    nodeMap: Map<string, StructureTreeNode[]>;
    optimizedMapping: Map<string, OptimizedMappingEntry[]>;
}

function nodeVisible(context: RenderTargetContext, uuid: string) {
    const nodes = context.nodeMap.get(uuid);
    return !nodes || nodes.length === 0 || nodes.some((node) => node.visible !== false);
}

function getNodeName(context: RenderTargetContext, uuid: string, fallback: string) {
    const node = context.nodeMap.get(uuid)?.[0];
    return node?.name || fallback;
}

function isWorldVisible(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
        if (!current.visible) return false;
        current = current.parent;
    }
    return true;
}

function buildBox(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return null;
    const box = geometry.boundingBox.clone().applyMatrix4(matrixWorld);
    return box.isEmpty() ? null : box;
}

function getCachedMeshWorldBox(mesh: THREE.Mesh) {
    const userData = mesh.userData || (mesh.userData = {});
    const elements = mesh.matrixWorld.elements;
    const matrixKey = `${elements[12]},${elements[13]},${elements[14]},${elements[0]},${elements[5]},${elements[10]}`;
    const cached = userData.__rtWorldBoxCache as { key: string; box: THREE.Box3 } | undefined;
    if (cached && cached.key === matrixKey) return cached.box.clone();
    const box = buildBox(mesh.geometry, mesh.matrixWorld);
    if (box) {
        userData.__rtWorldBoxCache = { key: matrixKey, box: box.clone() };
    }
    return box;
}

function getCachedInstanceWorldBox(
    uuid: string,
    mapping: OptimizedMappingEntry,
    geometry: THREE.BufferGeometry,
    matrixWorld: THREE.Matrix4
) {
    const meshUserData = mapping.mesh.userData || (mapping.mesh.userData = {});
    const cache = (meshUserData.__rtInstanceBoxCache ||= new Map<string, THREE.Box3>()) as Map<string, THREE.Box3>;
    const key = `${uuid}:${mapping.instanceId}`;
    const cached = cache.get(key);
    if (cached) return cached.clone();
    const box = buildBox(geometry, matrixWorld);
    if (box) cache.set(key, box.clone());
    return box;
}

function addMeshTarget(context: RenderTargetContext, mesh: THREE.Mesh, targets: Map<string, RenderTarget>) {
    if (!isWorldVisible(mesh) || !mesh.geometry || mesh.userData?.isIfcGridHelper) return;
    if ((mesh as any).isBatchedMesh || mesh.userData?.isOptimized) return;

    mesh.updateMatrixWorld(true);
    const box = getCachedMeshWorldBox(mesh);
    if (!box) return;

    const key = `mesh:${mesh.uuid}`;
    targets.set(key, {
        key,
        uuid: mesh.uuid,
        name: mesh.name || getNodeName(context, mesh.uuid, mesh.uuid),
        object: mesh,
        geometry: mesh.geometry,
        matrixWorld: mesh.matrixWorld.clone(),
        box,
        type: "mesh"
    });
}

function addInstanceTarget(
    context: RenderTargetContext,
    uuid: string,
    mapping: OptimizedMappingEntry,
    targets: Map<string, RenderTarget>
) {
    if (!isWorldVisible(mapping.mesh) || !nodeVisible(context, uuid)) return;
    const geometry = mapping.geometry || mapping.mesh.geometry;
    if (!geometry) return;

    const instanceMatrix = new THREE.Matrix4();
    mapping.mesh.getMatrixAt(mapping.instanceId, instanceMatrix);
    instanceMatrix.premultiply(mapping.mesh.matrixWorld);
    const box = getCachedInstanceWorldBox(uuid, mapping, geometry, instanceMatrix);
    if (!box) return;

    const key = `instance:${mapping.mesh.uuid}:${mapping.instanceId}`;
    targets.set(key, {
        key,
        uuid,
        name: getNodeName(context, uuid, uuid),
        object: mapping.mesh,
        geometry,
        matrixWorld: instanceMatrix.clone(),
        box,
        type: "instance",
        ownerUuid: uuid,
        batchedMesh: mapping.mesh,
        instanceId: mapping.instanceId,
        originalColor: mapping.originalColor
    });
}

function collectNodeIds(context: RenderTargetContext, ids: string[]) {
    const expanded = new Set<string>();
    const queue = ids.filter(Boolean);
    const visited = new Set<string>();

    // 游标遍历替代 shift()：框选上万构件时 shift() 的数组搬移会让主线程卡死。
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        if (!current || visited.has(current)) continue;
        visited.add(current);
        expanded.add(current);

        const nodes = context.nodeMap.get(current);
        if (!nodes) continue;
        for (const node of nodes) {
            const children = Array.isArray(node.children) ? node.children : [];
            for (const child of children) {
                if (!visited.has(child.id)) queue.push(child.id);
            }
        }
    }

    return expanded;
}

export function expandRenderableIds(context: RenderTargetContext, ids: string[]) {
    return collectNodeIds(context, ids);
}

export function collectRenderableTargetsForIds(context: RenderTargetContext, ids: string[]) {
    const targets = new Map<string, RenderTarget>();
    const expandedIds = collectNodeIds(context, Array.from(new Set(ids.filter(Boolean))));

    context.contentGroup.updateMatrixWorld(true);
    expandedIds.forEach((uuid) => {
        const mappings = context.optimizedMapping.get(uuid);
        if (mappings && mappings.length > 0) {
            // 分块构件已全部落在 BatchedMesh 实例上，命中映射后不必再做全场景 uuid 搜索。
            // getObjectByProperty 内部是整棵树遍历，框选上万构件时会变成
            // O(选中数 × 场景对象数)，这是大模型框选卡死的主要原因。
            mappings.forEach((mapping) => addInstanceTarget(context, uuid, mapping, targets));
            return;
        }

        const object = context.contentGroup.getObjectByProperty("uuid", uuid);
        if (!object) return;
        if ((object as THREE.Mesh).isMesh) {
            addMeshTarget(context, object as THREE.Mesh, targets);
            return;
        }

        object.traverse((child) => {
            if (child === object) return;
            if ((child as THREE.Mesh).isMesh) addMeshTarget(context, child as THREE.Mesh, targets);
        });
    });

    return Array.from(targets.values());
}

export function collectAllRenderableTargets(context: RenderTargetContext) {
    const targets = new Map<string, RenderTarget>();
    context.contentGroup.updateMatrixWorld(true);

    context.contentGroup.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) addMeshTarget(context, object as THREE.Mesh, targets);
    });

    context.optimizedMapping.forEach((mappings, uuid) => {
        mappings.forEach((mapping) => addInstanceTarget(context, uuid, mapping, targets));
    });

    return Array.from(targets.values());
}

export function collectRenderableBoundsForIds(context: RenderTargetContext, ids: string[]) {
    // 大范围框选（上万构件）时避免构造 RenderTarget 对象，直接累加实例包围盒。
    if (ids.length > 2000) {
        const box = new THREE.Box3();
        const matrix = new THREE.Matrix4();
        const temp = new THREE.Box3();
        const expandedIds = collectNodeIds(context, Array.from(new Set(ids.filter(Boolean))));
        context.contentGroup.updateMatrixWorld(true);
        expandedIds.forEach((uuid) => {
            const mappings = context.optimizedMapping.get(uuid);
            if (!mappings || mappings.length === 0) return;
            for (const mapping of mappings) {
                if (!isWorldVisible(mapping.mesh) || !nodeVisible(context, uuid)) continue;
                const geometry = mapping.geometry || mapping.mesh.geometry;
                if (!geometry) continue;
                if (!geometry.boundingBox) geometry.computeBoundingBox();
                if (!geometry.boundingBox) continue;
                mapping.mesh.getMatrixAt(mapping.instanceId, matrix);
                matrix.premultiply(mapping.mesh.matrixWorld);
                temp.copy(geometry.boundingBox).applyMatrix4(matrix);
                if (!temp.isEmpty()) box.union(temp);
            }
        });
        if (!box.isEmpty()) return box;
    }

    const box = new THREE.Box3();
    collectRenderableTargetsForIds(context, ids).forEach((target) => box.union(target.box));
    return box;
}
