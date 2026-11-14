import * as THREE from "three";
import { getBatchedInstanceWorldBox } from "./batchedGeometryView";
import type { StructureTreeNode } from "./types";

type PickChunk = {
    loaded?: boolean;
    mesh?: THREE.Object3D | null;
};

interface SceneManagerPickingContext {
    canvas: HTMLCanvasElement;
    camera: THREE.Camera;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    contentGroup: THREE.Group;
    chunks: PickChunk[];
    nodeMap: Map<string, StructureTreeNode[]>;
    interactableList: THREE.Object3D[];
    interactableListValid: boolean;
}

interface SceneManagerPickingState {
    interactableList: THREE.Object3D[];
    interactableListValid: boolean;
}

interface ScreenRectSelectionContext {
    camera: THREE.Camera;
    interactableList: THREE.Object3D[];
}

function buildInteractableList(context: SceneManagerPickingContext) {
    const interactableList: THREE.Object3D[] = [];

    if (context.chunks.length > 0) {
        context.chunks.forEach((chunk) => {
            // 只要求已加载，不要求当前可见：渲染预算会把远景分块换成线框代理，
            // 但数据仍然驻留，点选/框选必须覆盖它们，否则选择结果会随预算变化。
            if (chunk.loaded && chunk.mesh) {
                interactableList.push(chunk.mesh);
            }
        });
    }

    const traverseLimit = (object: THREE.Object3D, depth: number) => {
        if (depth > 10) return;
        if (!object.visible) return;
        if ((object as any).userData.chunkId) return;

        if ((object as THREE.Mesh).isMesh || (object as any).isBatchedMesh) {
            if (!object.userData.isOptimized) {
                interactableList.push(object);
            }
            return;
        }

        if (object.children.length === 0) return;
        for (const child of object.children) {
            traverseLimit(child, depth + 1);
        }
    };

    for (const child of context.contentGroup.children) {
        if (child.userData.isOptimizedGroup) continue;
        traverseLimit(child, 0);
    }

    return interactableList;
}

function createProxyObjectForBatchedHit(
    context: SceneManagerPickingContext,
    batchedMesh: THREE.BatchedMesh,
    batchId: number,
    originalUuid: string
) {
    const nodes = context.nodeMap.get(originalUuid);
    const node = nodes?.[0];
    const proxy = new THREE.Object3D();
    proxy.uuid = originalUuid;

    if (node) {
        proxy.name = node.name;
        (proxy as any).type = node.type;
        (proxy as any).isMesh = node.type === "Mesh";
    }

    proxy.getWorldPosition = (vector: THREE.Vector3) => {
        const matrix = new THREE.Matrix4();
        batchedMesh.getMatrixAt(batchId, matrix);
        matrix.premultiply(batchedMesh.matrixWorld);
        return vector.setFromMatrixPosition(matrix);
    };

    const matrix = new THREE.Matrix4();
    batchedMesh.getMatrixAt(batchId, matrix);
    proxy.position.setFromMatrixPosition(matrix);

    return proxy;
}

export function ensureInteractableList(
    context: SceneManagerPickingContext
): SceneManagerPickingState {
    if (context.interactableListValid) {
        return {
            interactableList: context.interactableList,
            interactableListValid: true
        };
    }

    return {
        interactableList: buildInteractableList(context),
        interactableListValid: true
    };
}

export function applyGetRayIntersects(
    context: SceneManagerPickingContext,
    clientX: number,
    clientY: number
): { intersect: THREE.Intersection | null; state: SceneManagerPickingState } {
    const rect = context.canvas.getBoundingClientRect();
    context.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    context.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    context.raycaster.setFromCamera(context.mouse, context.camera);

    const state = ensureInteractableList(context);
    // 先用分块包围盒和射线做粗筛：全量驻留 1200+ 块时，
    // 直接 raycast 所有 BatchedMesh（每块几百个实例）会点一次卡几百毫秒。
    const rayBox = new THREE.Box3();
    const candidates = state.interactableList.filter((object) => {
        if (!(object as any).isBatchedMesh) return true;
        const batched = object as THREE.BatchedMesh;
        const boundingBox = (batched as any).boundingBox as THREE.Box3 | undefined;
        if (!boundingBox) return true;
        batched.updateMatrixWorld();
        rayBox.copy(boundingBox).applyMatrix4(batched.matrixWorld);
        return context.raycaster.ray.intersectsBox(rayBox);
    });
    const intersects = context.raycaster.intersectObjects(candidates, false);
    if (intersects.length === 0) {
        return { intersect: null, state };
    }

    const hit = intersects[0];
    if (!(hit.object as any).isBatchedMesh) {
        return { intersect: hit, state };
    }

    const batchedMesh = hit.object as THREE.BatchedMesh;
    const batchId = (hit as any).batchId !== undefined ? (hit as any).batchId : (hit as any).instanceId;
    if (batchId === undefined) {
        return { intersect: hit, state };
    }

    const originalUuid = (batchedMesh.userData.batchIdToUuid as Map<number, string> | undefined)?.get(batchId);
    if (!originalUuid) {
        return { intersect: hit, state };
    }

    const originalObject = context.contentGroup.getObjectByProperty("uuid", originalUuid);
    (hit as any).object = originalObject ?? createProxyObjectForBatchedHit(context, batchedMesh, batchId, originalUuid);

    // 记录命中的具体实例（分块 BatchedMesh + instanceId）：
    // 同一个节点可能对应多个实例（InstancedMesh / NBIM 实例化构件），
    // 单选时必须只高亮命中的那一个实例，而不是整个节点的所有实例。
    (hit as any).batchedMesh = batchedMesh;
    (hit as any).batchId = batchId;

    return { intersect: hit, state };
}

export function selectInteractablesByScreenRect(
    context: ScreenRectSelectionContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): string[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const originalMatrix = context.camera.projectionMatrix.clone();
    const newMatrix = new THREE.Matrix4();

    const selectWidth = maxX - minX;
    const selectHeight = maxY - minY;
    const scaleX = selectWidth / 2;
    const scaleY = selectHeight / 2;
    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;

    const translateMatrix = new THREE.Matrix4().makeTranslation(-centerX, -centerY, 0);
    const scaleMatrix = new THREE.Matrix4().makeScale(1 / scaleX, 1 / scaleY, 1);
    newMatrix.multiplyMatrices(scaleMatrix, translateMatrix);

    const modifiedProjectionMatrix = newMatrix.multiply(originalMatrix);
    const frustum = new THREE.Frustum();
    const viewMatrix = context.camera.matrixWorldInverse;
    const projViewMatrix = modifiedProjectionMatrix.clone().multiply(viewMatrix);
    frustum.setFromProjectionMatrix(projViewMatrix);

    const selected: string[] = [];
    const selectedSet = new Set<string>();
    const box = new THREE.Box3();
    const tmpMatrix = new THREE.Matrix4();
    const meshBox = new THREE.Box3();
    const instanceBox = new THREE.Box3();

    for (const object of context.interactableList) {
        if ((object as any).isBatchedMesh) {
            const batchedMesh = object as THREE.BatchedMesh;
            const batchIdToUuid = batchedMesh.userData.batchIdToUuid as Map<number, string> | undefined;
            if (!batchIdToUuid) continue;

            // 先按整个分块包围盒剔除：框选通常只覆盖少数分块，避免逐个实例计算导致卡死。
            if ((batchedMesh as any).boundingBox) {
                meshBox.copy((batchedMesh as any).boundingBox).applyMatrix4(batchedMesh.matrixWorld);
                if (!frustum.intersectsBox(meshBox)) continue;
            }

            const getVisibleAt = (batchedMesh as any).getVisibleAt as ((id: number) => boolean) | undefined;
            const getGeometryIdAt = (batchedMesh as any).getGeometryIdAt as ((id: number) => number) | undefined;
            const getBoundingBoxAt = (batchedMesh as any).getBoundingBoxAt as
                ((geometryId: number, target: THREE.Box3) => THREE.Box3 | null) | undefined;
            // 几何级局部盒（中心 + 半尺寸）缓存
            const geometrySphereCache = new Map<number, { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }>();

            for (const [batchId, uuid] of batchIdToUuid) {
                try {
                    if (selectedSet.has(uuid)) continue;
                    if (getVisibleAt && getVisibleAt.call(batchedMesh, batchId) === false) continue;

                    // 廉价粗筛：用 OBB→AABB 公式构造“世界 AABB 的精确包球”再测 6 平面。
                    // 注意：不能直接用局部球 × 矩阵 —— 盒测试判定的是【世界 AABB】
                    // （实例旋转后 AABB 被盒化放大 √2），局部球不包住它，会误剔盒命中实例（已实测复现）。
                    // 世界 AABB 半尺寸 = |矩阵列| × 局部半尺寸（标准 OBB→AABB 公式，精确），
                    // 包球半径 = 该半尺寸向量的长度，球心 = 局部盒中心 × 矩阵。
                    if (getGeometryIdAt && getBoundingBoxAt) {
                        const geometryId = getGeometryIdAt.call(batchedMesh, batchId);
                        let local = geometrySphereCache.get(geometryId);
                        if (!local) {
                            const box = new THREE.Box3();
                            if (getBoundingBoxAt.call(batchedMesh, geometryId, box) === null) {
                                continue;
                            }
                            local = {
                                cx: (box.min.x + box.max.x) / 2,
                                cy: (box.min.y + box.max.y) / 2,
                                cz: (box.min.z + box.max.z) / 2,
                                hx: (box.max.x - box.min.x) / 2,
                                hy: (box.max.y - box.min.y) / 2,
                                hz: (box.max.z - box.min.z) / 2
                            };
                            geometrySphereCache.set(geometryId, local);
                        }
                        batchedMesh.getMatrixAt(batchId, tmpMatrix);
                        tmpMatrix.premultiply(batchedMesh.matrixWorld);
                        const e = tmpMatrix.elements;
                        const wx = e[0] * local.cx + e[4] * local.cy + e[8] * local.cz + e[12];
                        const wy = e[1] * local.cx + e[5] * local.cy + e[9] * local.cz + e[13];
                        const wz = e[2] * local.cx + e[6] * local.cy + e[10] * local.cz + e[14];
                        const hxW = Math.abs(e[0]) * local.hx + Math.abs(e[4]) * local.hy + Math.abs(e[8]) * local.hz;
                        const hyW = Math.abs(e[1]) * local.hx + Math.abs(e[5]) * local.hy + Math.abs(e[9]) * local.hz;
                        const hzW = Math.abs(e[2]) * local.hx + Math.abs(e[6]) * local.hy + Math.abs(e[10]) * local.hz;
                        const rW = Math.hypot(hxW, hyW, hzW) + 1e-4;
                        let miss = false;
                        for (let pi = 0; pi < 6; pi++) {
                            const plane = frustum.planes[pi];
                            const d = plane.normal.x * wx + plane.normal.y * wy + plane.normal.z * wz + plane.constant;
                            if (d < -rW) { miss = true; break; }
                        }
                        if (miss) continue;
                    }

                    // 精确判定：直接用合并缓冲上的 per-geometry 包围盒，不创建逐实例几何视图。
                    const worldBox = getBatchedInstanceWorldBox(batchedMesh, batchId, instanceBox, tmpMatrix);
                    if (worldBox && frustum.intersectsBox(worldBox)) {
                        selectedSet.add(uuid);
                        selected.push(uuid);
                    }
                } catch {
                    // ignore malformed batched entries and keep scanning remaining instances
                }
            }
            continue;
        }

        box.setFromObject(object);
        if (frustum.intersectsBox(box) && !selectedSet.has(object.uuid)) {
            selectedSet.add(object.uuid);
            selected.push(object.uuid);
        }
    }

    return selected;
}

