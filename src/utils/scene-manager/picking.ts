import * as THREE from "three";
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
            if (chunk.loaded && chunk.mesh && chunk.mesh.visible) {
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
    const intersects = context.raycaster.intersectObjects(state.interactableList, false);
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
    const box = new THREE.Box3();
    const tmpMatrix = new THREE.Matrix4();

    for (const object of context.interactableList) {
        if ((object as any).isBatchedMesh) {
            const batchedMesh = object as THREE.BatchedMesh;
            const batchIdToUuid = batchedMesh.userData.batchIdToUuid as Map<number, string> | undefined;
            const batchIdToGeometry = batchedMesh.userData.batchIdToGeometry as Map<number, THREE.BufferGeometry> | undefined;
            if (!batchIdToUuid || !batchIdToGeometry) continue;

            for (const [batchId, uuid] of batchIdToUuid) {
                try {
                    const geometry = batchIdToGeometry.get(batchId);
                    if (!geometry) continue;

                    batchedMesh.getMatrixAt(batchId, tmpMatrix);
                    tmpMatrix.premultiply(batchedMesh.matrixWorld);

                    const geometryBox = new THREE.Box3();
                    if (!geometry.boundingBox) geometry.computeBoundingBox();
                    geometryBox.copy(geometry.boundingBox!).applyMatrix4(tmpMatrix);

                    if (frustum.intersectsBox(geometryBox)) {
                        selected.push(uuid);
                    }
                } catch {
                    // ignore malformed batched entries and keep scanning remaining instances
                }
            }
            continue;
        }

        box.setFromObject(object);
        if (frustum.intersectsBox(box)) {
            selected.push(object.uuid);
        }
    }

    return selected;
}

