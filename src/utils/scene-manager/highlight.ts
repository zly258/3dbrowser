import * as THREE from "three";
import { collectRenderableBoundsForIds, type OptimizedMappingEntry } from "./renderTargets";
import type { StructureTreeNode } from "./types";

type LocateDimmedInstance = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
    originalVisible: boolean;
};

type SceneManagerHighlightState = {
    highlightedUuids: Set<string>;
    locateResultSet: Set<string>;
    locateFocusUuid: string | null;
    lastSelectedUuid: string | null;
    /** 单选命中的具体实例：同一个节点可能有多个实例，只高亮这一个 */
    highlightedInstance: HighlightInstanceRef | null;
};

/** 命中的具体实例引用（分块 BatchedMesh + instanceId） */
export type HighlightInstanceRef = {
    uuid: string;
    mesh: THREE.BatchedMesh;
    instanceId: number;
};

interface SceneManagerHighlightContext {
    contentGroup: THREE.Group;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    nodeMap: Map<string, StructureTreeNode[]>;
    optimizedMapping: Map<string, OptimizedMappingEntry[]>;
    totalMeshCount: number;
    settings: {
        highlightColor?: string;
        highlightShowBox?: boolean;
    };
    state: SceneManagerHighlightState;
    locateMaterialCache: Map<string, THREE.Material | THREE.Material[]>;
    locateObjectMaterialCache: Map<string, THREE.Material | THREE.Material[]>;
    locateDimmedInstances: Map<string, LocateDimmedInstance>;
    clearClashPairHighlight: () => void;
}

export interface SceneHighlightResult {
    needsRender: boolean;
}

export interface LocateHighlightOptions {
    highlightColors?: Record<string, string>;
}

type LocateMeshMode = "target" | "dim" | "batchedTarget";

const LIGHTWEIGHT_LOCATE_MESH_THRESHOLD = 20000;
const LIGHTWEIGHT_LOCATE_TARGET_THRESHOLD = 320;

function getHighlightColor(settings: SceneManagerHighlightContext["settings"]) {
    return new THREE.Color(settings.highlightColor || "#ff9f1c");
}

function getColorForUuid(
    uuid: string,
    settings: SceneManagerHighlightContext["settings"],
    highlightColors?: Record<string, string>
) {
    return new THREE.Color(highlightColors?.[uuid] || settings.highlightColor || "#ff9f1c");
}

function expandLocateTargets(contentMap: Map<string, any[]>, ids: string[]) {
    const expanded = new Set<string>();
    const queue = [...ids];
    const visited = new Set<string>();

    // 用游标遍历而不是 shift()：框选上万个构件时，shift() 是 O(n²) 的数组搬移，
    // 会直接表现为“框选后界面卡死”。
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        if (!current || visited.has(current)) continue;
        visited.add(current);
        expanded.add(current);

        const nodes = contentMap.get(current);
        if (!nodes || nodes.length === 0) continue;
        for (const node of nodes) {
            if (!node.children || node.children.length === 0) continue;
            for (const child of node.children) {
                if (!visited.has(child.id)) queue.push(child.id);
            }
        }
    }

    return expanded;
}

function getSetDifference(source: Set<string>, other: Set<string>) {
    const result = new Set<string>();
    source.forEach((item) => {
        if (!other.has(item)) result.add(item);
    });
    return result;
}

function getSetIntersection(left: Set<string>, right: Set<string>) {
    const result = new Set<string>();
    left.forEach((item) => {
        if (right.has(item)) result.add(item);
    });
    return result;
}

function markInstanceColorNeedsUpdate(meshes: Iterable<THREE.BatchedMesh>) {
    for (const mesh of meshes) {
        if ((mesh as any).instanceColor) (mesh as any).instanceColor.needsUpdate = true;
    }
}

function restoreHighlightedInstanceColors(context: SceneManagerHighlightContext, uuids: Iterable<string>) {
    const touched = new Set<THREE.BatchedMesh>();
    for (const id of uuids) {
        const mappings = context.optimizedMapping.get(id);
        if (!mappings) continue;
        mappings.forEach((mapping) => {
            mapping.mesh.setColorAt(mapping.instanceId, new THREE.Color(mapping.originalColor));
            touched.add(mapping.mesh);
        });
    }
    markInstanceColorNeedsUpdate(touched);
}

function applyHighlightedInstanceColors(
    context: SceneManagerHighlightContext,
    uuids: Iterable<string>,
    options?: { focus?: HighlightInstanceRef | null; color?: THREE.Color }
) {
    const highlightColor = options?.color || getHighlightColor(context.settings);
    const focus = options?.focus || null;
    const touched = new Set<THREE.BatchedMesh>();
    const restoreColor = new THREE.Color();

    for (const id of uuids) {
        const mappings = context.optimizedMapping.get(id);
        if (!mappings) continue;
        mappings.forEach((mapping) => {
            if (focus && focus.uuid === id) {
                // 单选实例：只给命中的实例上高亮色，同一节点的其它实例恢复原色。
                const isFocused = mapping.mesh === focus.mesh && mapping.instanceId === focus.instanceId;
                mapping.mesh.setColorAt(
                    mapping.instanceId,
                    isFocused ? highlightColor : restoreColor.setHex(mapping.originalColor)
                );
            } else {
                mapping.mesh.setColorAt(mapping.instanceId, highlightColor);
            }
            touched.add(mapping.mesh);
        });
    }
    markInstanceColorNeedsUpdate(touched);
}

/** 发光脉冲：把当前单选实例的高亮色按倍率提亮（>1 在 ACES 色调映射下呈现过曝发光感） */
export function applyHighlightGlow(
    context: SceneManagerHighlightContext,
    glowScale: number
): SceneHighlightResult {
    const focus = context.state.highlightedInstance;
    if (!focus || !focus.mesh) return { needsRender: false };

    try {
        const base = getHighlightColor(context.settings);
        const glowing = base.multiplyScalar(THREE.MathUtils.clamp(glowScale, 1, 2.4));
        focus.mesh.setColorAt(focus.instanceId, glowing);
        if ((focus.mesh as any).instanceColor) (focus.mesh as any).instanceColor.needsUpdate = true;
        return { needsRender: true };
    } catch {
        // 分块可能已卸载/释放，忽略本次发光刷新
        return { needsRender: false };
    }
}

/** 高亮颜色设置变化后，立即用新颜色重绘当前高亮（含实例级高亮） */
export function applyRefreshHighlightColors(context: SceneManagerHighlightContext): SceneHighlightResult {
    const ids = Array.from(context.state.highlightedUuids);
    if (ids.length === 0) return { needsRender: false };
    applyHighlightedInstanceColors(context, ids, { focus: context.state.highlightedInstance });
    return { needsRender: true };
}

function updateSelectionHelpers(
    context: SceneManagerHighlightContext,
    target: Set<string>,
    focus?: HighlightInstanceRef | null
) {
    context.selectionBox.visible = false;
    context.highlightMesh.visible = false;

    if (target.size === 0) {
        return;
    }

    // 单选实例时，选择框只框住命中的那一个实例，而不是整个节点的所有实例。
    let union = focus ? getFocusedInstanceBounds(context, focus) : null;
    if (!union) {
        union = collectRenderableBoundsForIds(context, Array.from(target));
    }

    if (!union.isEmpty()) {
        context.selectionBox.box.copy(union);
        const locatingFocus = !!(context.state.locateFocusUuid && target.has(context.state.locateFocusUuid));
        if (locatingFocus) {
            const pad = Math.max(union.getSize(new THREE.Vector3()).length() * 0.048, 0.22);
            context.selectionBox.box.expandByScalar(pad);
        }
        // 包围盒是否显示只由 settings.highlightShowBox 控制。
        // 定位与普通高亮共用同一个开关，避免“定位总是强制显示包围盒”。
        context.selectionBox.visible = !!context.settings.highlightShowBox;
    }

    const focusId = context.state.locateFocusUuid || context.state.lastSelectedUuid;
    if (!focusId) return;

    const focusMappings = context.optimizedMapping.get(focusId);
    if (focusMappings && focusMappings.length > 0) {
        context.highlightMesh.visible = false;
        return;
    }

    const focusObject = context.contentGroup.getObjectByProperty("uuid", focusId);
    if (!focusObject || !(focusObject as THREE.Mesh).isMesh) return;

    focusObject.updateMatrixWorld(true);
    context.highlightMesh.geometry = (focusObject as THREE.Mesh).geometry;

    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    focusObject.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    worldScale.multiplyScalar(1.035);

    context.highlightMesh.position.copy(worldPosition);
    context.highlightMesh.quaternion.copy(worldQuaternion);
    context.highlightMesh.scale.copy(worldScale);
    context.highlightMesh.visible = true;
}

/** 命中实例的世界包围盒 */
function getFocusedInstanceBounds(
    context: SceneManagerHighlightContext,
    focus: HighlightInstanceRef
): THREE.Box3 | null {
    const mapping = context.optimizedMapping
        .get(focus.uuid)
        ?.find((item) => item.mesh === focus.mesh && item.instanceId === focus.instanceId);
    const geometry = mapping?.geometry
        || (focus.mesh.userData.batchIdToGeometry as Map<number, THREE.BufferGeometry> | undefined)?.get(focus.instanceId);
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return null;

    const matrix = new THREE.Matrix4();
    focus.mesh.getMatrixAt(focus.instanceId, matrix);
    matrix.premultiply(focus.mesh.matrixWorld);
    return geometry.boundingBox.clone().applyMatrix4(matrix);
}

function materialList(material: THREE.Material | THREE.Material[]) {
    return Array.isArray(material) ? material : [material];
}

function getLocateMaterialKey(
    material: THREE.Material | THREE.Material[],
    mode: LocateMeshMode,
    accentColor: THREE.Color
) {
    const ids = materialList(material).map((item) => item.uuid).join("|");
    return `${mode}:${accentColor.getHexString()}:${ids}`;
}

function createDerivedMaterial(
    source: THREE.Material,
    mode: LocateMeshMode,
    accentColor: THREE.Color
) {
    const cloned = source.clone() as THREE.Material & {
        color?: THREE.Color;
        emissive?: THREE.Color;
        transparent: boolean;
        opacity: number;
        depthWrite: boolean;
    };

    if (mode === "target") {
        cloned.transparent = false;
        cloned.opacity = 1;
        cloned.depthWrite = true;
        if (cloned.color) cloned.color.copy(accentColor);
        if (cloned.emissive) cloned.emissive.copy(accentColor).multiplyScalar(0.4);
        return cloned;
    }

    if (mode === "batchedTarget") {
        cloned.transparent = true;
        cloned.opacity = 0.25;
        cloned.depthWrite = false;
        if (cloned.emissive) cloned.emissive.set(0x000000);
        return cloned;
    }

    cloned.transparent = true;
    cloned.opacity = 0.05;
    cloned.depthWrite = false;
    if (cloned.color) cloned.color.set("#f5f5f5");
    if (cloned.emissive) cloned.emissive.set(0x000000);
    return cloned;
}

function getOrCreateLocateMaterials(
    context: SceneManagerHighlightContext,
    original: THREE.Material | THREE.Material[],
    mode: LocateMeshMode,
    accentColor: THREE.Color
) {
    const key = getLocateMaterialKey(original, mode, accentColor);
    const cached = context.locateMaterialCache.get(key);
    if (cached) return cached;

    const originals = materialList(original);
    const derived = originals.map((source) => createDerivedMaterial(source, mode, accentColor));
    const next = Array.isArray(original) ? derived : derived[0];
    context.locateMaterialCache.set(key, next);
    return next;
}

function disposeLocateMaterialEntry(material: THREE.Material | THREE.Material[]) {
    const items = Array.isArray(material) ? material : [material];
    items.forEach((item) => item.dispose());
}

function restoreOriginalLocateMaterials(context: SceneManagerHighlightContext) {
    context.locateObjectMaterialCache.forEach((material, uuid) => {
        const object = context.contentGroup.getObjectByProperty("uuid", uuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
        if (!object) return;
        if (object.isMesh || (object as any).isBatchedMesh) {
            (object as any).material = material;
        }
    });
}

function restoreAllLocateInstanceColors(context: SceneManagerHighlightContext) {
    const touched = new Set<THREE.BatchedMesh>();
    context.locateDimmedInstances.forEach(({ mesh, instanceId, originalColor, originalVisible }) => {
        mesh.setColorAt(instanceId, new THREE.Color(originalColor));
        if ((mesh as any).setVisibleAt) {
            (mesh as any).setVisibleAt(instanceId, originalVisible);
        }
        touched.add(mesh);
    });
    markInstanceColorNeedsUpdate(touched);
}

function clearLocateVisualCaches(context: SceneManagerHighlightContext) {
    restoreOriginalLocateMaterials(context);
    restoreAllLocateInstanceColors(context);
    context.locateMaterialCache.forEach((material) => disposeLocateMaterialEntry(material));
    context.locateMaterialCache.clear();
    context.locateObjectMaterialCache.clear();
    context.locateDimmedInstances.clear();
}

function collectTargetBatchedMeshIds(context: SceneManagerHighlightContext, targets: Set<string>) {
    const ids = new Set<string>();
    targets.forEach((uuid) => {
        const mappings = context.optimizedMapping.get(uuid);
        if (!mappings) return;
        mappings.forEach((mapping) => ids.add(mapping.mesh.uuid));
    });
    return ids;
}

function assignLocateMaterialsForTraverse(
    context: SceneManagerHighlightContext,
    targets: Set<string>,
    targetBatchedMeshIds: Set<string>,
    accentColor: THREE.Color
) {
    context.contentGroup.traverse((child) => {
        const mesh = child as THREE.Mesh & { isBatchedMesh?: boolean };
        if (!mesh.isMesh || !mesh.material) return;

        if (!context.locateObjectMaterialCache.has(child.uuid)) {
            context.locateObjectMaterialCache.set(child.uuid, mesh.material);
        }

        const original = context.locateObjectMaterialCache.get(child.uuid);
        if (!original) return;

        const mode: LocateMeshMode = (mesh as any).isBatchedMesh
            ? (targetBatchedMeshIds.has(mesh.uuid) ? "batchedTarget" : "dim")
            : (targets.has(mesh.uuid) ? "target" : "dim");

        mesh.material = getOrCreateLocateMaterials(context, original, mode, accentColor);
    });
}

function assignLocateMaterialForObject(
    context: SceneManagerHighlightContext,
    uuid: string,
    mode: LocateMeshMode,
    accentColor: THREE.Color
) {
    const object = context.contentGroup.getObjectByProperty("uuid", uuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
    if (!object || !object.isMesh || !object.material) return;
    if (!context.locateObjectMaterialCache.has(uuid)) {
        context.locateObjectMaterialCache.set(uuid, object.material);
    }
    const original = context.locateObjectMaterialCache.get(uuid);
    if (!original) return;
    object.material = getOrCreateLocateMaterials(context, original, mode, accentColor);
}

function assignLocateMaterialForBatchedMesh(
    context: SceneManagerHighlightContext,
    meshUuid: string,
    mode: LocateMeshMode,
    accentColor: THREE.Color
) {
    const object = context.contentGroup.getObjectByProperty("uuid", meshUuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
    if (!object || !object.isMesh || !object.material) return;
    if (!context.locateObjectMaterialCache.has(meshUuid)) {
        context.locateObjectMaterialCache.set(meshUuid, object.material);
    }
    const original = context.locateObjectMaterialCache.get(meshUuid);
    if (!original) return;
    object.material = getOrCreateLocateMaterials(context, original, mode, accentColor);
}

function applyInitialLocateInstanceState(
    context: SceneManagerHighlightContext,
    targets: Set<string>,
    focusKey: string | null,
    accentColor: THREE.Color,
    highlightColors?: Record<string, string>
) {
    const dimmedColor = new THREE.Color("#e0e0e0");
    const touched = new Set<THREE.BatchedMesh>();

    context.optimizedMapping.forEach((mappings, originalUuid) => {
        const isMatched = targets.has(originalUuid);
        const objectColor = getColorForUuid(originalUuid, context.settings, highlightColors);
        const nextColor = isMatched
            ? (focusKey !== null && originalUuid === focusKey
                ? objectColor
                : objectColor.clone().lerp(new THREE.Color("#ffffff"), 0.2))
            : dimmedColor;

        mappings.forEach((mapping) => {
            const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
            if (!context.locateDimmedInstances.has(key)) {
                context.locateDimmedInstances.set(key, {
                    mesh: mapping.mesh,
                    instanceId: mapping.instanceId,
                    originalColor: mapping.originalColor,
                    originalVisible: true
                });
            }

            mapping.mesh.setColorAt(mapping.instanceId, nextColor);
            touched.add(mapping.mesh);
        });
    });

    markInstanceColorNeedsUpdate(touched);
}

function applyLocateInstanceStateDiff(
    context: SceneManagerHighlightContext,
    entering: Set<string>,
    exiting: Set<string>,
    previousFocusUuid: string | null,
    focusKey: string | null,
    accentColor: THREE.Color,
    highlightColors?: Record<string, string>
) {
    const dimmedColor = new THREE.Color("#e0e0e0");
    const touched = new Set<THREE.BatchedMesh>();
    const idsToUpdate = new Set<string>();

    entering.forEach((uuid) => idsToUpdate.add(uuid));
    exiting.forEach((uuid) => idsToUpdate.add(uuid));
    if (previousFocusUuid) idsToUpdate.add(previousFocusUuid);
    if (focusKey) idsToUpdate.add(focusKey);

    idsToUpdate.forEach((uuid) => {
        const mappings = context.optimizedMapping.get(uuid);
        if (!mappings) return;

        const isMatched = context.state.locateResultSet.has(uuid);
        const objectColor = getColorForUuid(uuid, context.settings, highlightColors);
        const nextColor = isMatched
            ? (focusKey !== null && uuid === focusKey
                ? objectColor
                : objectColor.clone().lerp(new THREE.Color("#ffffff"), 0.2))
            : dimmedColor;

        mappings.forEach((mapping) => {
            const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
            if (!context.locateDimmedInstances.has(key)) {
                context.locateDimmedInstances.set(key, {
                    mesh: mapping.mesh,
                    instanceId: mapping.instanceId,
                    originalColor: mapping.originalColor,
                    originalVisible: true
                });
            }

            mapping.mesh.setColorAt(mapping.instanceId, nextColor);
            touched.add(mapping.mesh);
        });
    });

    markInstanceColorNeedsUpdate(touched);
}

function shouldUseLightweightLocate(
    context: SceneManagerHighlightContext,
    expandedTargets: Set<string>
) {
    return context.totalMeshCount >= LIGHTWEIGHT_LOCATE_MESH_THRESHOLD
        || expandedTargets.size >= LIGHTWEIGHT_LOCATE_TARGET_THRESHOLD;
}

function applyLightweightLocateState(
    context: SceneManagerHighlightContext,
    expandedTargets: Set<string>,
    focusKey: string | null,
    highlightColors?: Record<string, string>
): SceneHighlightResult {
    context.clearClashPairHighlight();
    clearLocateVisualCaches(context);

    const touched = new Set<THREE.BatchedMesh>();

    expandedTargets.forEach((uuid) => {
        assignLocateMaterialForObject(
            context,
            uuid,
            "target",
            getColorForUuid(uuid, context.settings, highlightColors)
        );

        const mappings = context.optimizedMapping.get(uuid);
        if (!mappings) return;

        const objectColor = getColorForUuid(uuid, context.settings, highlightColors);
        const nextColor = focusKey !== null && uuid === focusKey
            ? objectColor
            : objectColor.clone().lerp(new THREE.Color("#ffffff"), 0.2);

        mappings.forEach((mapping) => {
            const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
            if (!context.locateDimmedInstances.has(key)) {
                context.locateDimmedInstances.set(key, {
                    mesh: mapping.mesh,
                    instanceId: mapping.instanceId,
                    originalColor: mapping.originalColor,
                    originalVisible: true
                });
            }
            mapping.mesh.setColorAt(mapping.instanceId, nextColor);
            touched.add(mapping.mesh);
        });
    });

    markInstanceColorNeedsUpdate(touched);
    context.state.highlightedUuids = new Set(expandedTargets);
    context.state.lastSelectedUuid = focusKey;
    updateSelectionHelpers(context, expandedTargets);
    return { needsRender: true };
}

export function applyHighlightObjects(
    context: SceneManagerHighlightContext,
    uuids: string[],
    instanceRef?: HighlightInstanceRef | null
): SceneHighlightResult {
    context.clearClashPairHighlight();
    const normalized = Array.from(new Set(uuids.filter(Boolean)));
    const target = expandLocateTargets(context.nodeMap, normalized);
    const focus = instanceRef && instanceRef.mesh && target.has(instanceRef.uuid) ? instanceRef : null;
    const previousFocus = context.state.highlightedInstance;

    const preserveLocateTint = context.state.locateResultSet.size > 0;
    if (!preserveLocateTint) {
        restoreHighlightedInstanceColors(context, Array.from(context.state.highlightedUuids).filter((id) => !target.has(id)));

        const entering = Array.from(target).filter((id) => !context.state.highlightedUuids.has(id));
        if (focus && !entering.includes(focus.uuid)) {
            // 同一个节点的不同实例之间切换时，uuid 已在高亮集合里，需要强制重绘该节点。
            entering.push(focus.uuid);
        } else if (!focus && previousFocus && target.has(previousFocus.uuid) && !entering.includes(previousFocus.uuid)) {
            // 取消实例级高亮（例如框选/程序选中同一节点）时，恢复为整个节点高亮。
            entering.push(previousFocus.uuid);
        }
        applyHighlightedInstanceColors(context, entering, { focus });
    }

    context.state.highlightedUuids = target;
    context.state.highlightedInstance = focus;
    context.state.lastSelectedUuid = uuids.length > 0 ? uuids[uuids.length - 1] : null;
    updateSelectionHelpers(context, target, focus);

    return { needsRender: true };
}

export function applyClearLocateFocus(
    context: SceneManagerHighlightContext
): SceneHighlightResult {
    context.clearClashPairHighlight();

    // 清除定位/高亮时只恢复上一次真正改过的实例颜色，
    // 不再遍历全模型，也不刷新模型树。
    restoreHighlightedInstanceColors(context, context.state.highlightedUuids);

    if (
        context.locateObjectMaterialCache.size > 0 ||
        context.locateDimmedInstances.size > 0 ||
        context.locateMaterialCache.size > 0
    ) {
        clearLocateVisualCaches(context);
    }

    context.state.locateResultSet.clear();
    context.state.locateFocusUuid = null;
    context.state.highlightedUuids = new Set();
    context.state.highlightedInstance = null;
    context.state.lastSelectedUuid = null;
    context.selectionBox.visible = false;
    context.highlightMesh.visible = false;

    return { needsRender: true };
}

export function applySetLocateResultSet(
    context: SceneManagerHighlightContext & { nodeMap: Map<string, any[]> },
    uuids: string[],
    focusUuid: string | null = null,
    options?: LocateHighlightOptions
): SceneHighlightResult {
    const normalized = Array.from(new Set(uuids.filter(Boolean)));
    if (normalized.length === 0) {
        return applyClearLocateFocus(context);
    }

    context.clearClashPairHighlight();

    // 定位高亮只做“目标高亮 + 选择框/包围盒”，不再灰化/透明化其他对象。
    // 之前这里会遍历全模型、替换材质、修改透明度/实例颜色，恢复时也要全量还原，
    // 大模型下搜索定位和恢复显示都会明显卡顿。
    if (
        context.locateObjectMaterialCache.size > 0 ||
        context.locateDimmedInstances.size > 0 ||
        context.locateMaterialCache.size > 0
    ) {
        clearLocateVisualCaches(context);
    }

    const expandedTargets = expandLocateTargets(context.nodeMap, normalized);
    const expandedList = Array.from(expandedTargets);
    const previousHighlighted = new Set(context.state.highlightedUuids);
    const highlightColors = options?.highlightColors;
    const focusKey = focusUuid && expandedTargets.has(focusUuid)
        ? focusUuid
        : expandedList[0] || null;

    // 增量高亮：只恢复离开的对象，只设置新进入的对象，以及焦点/颜色发生变化的对象。
    // 不再每次对 expandedTargets 全量 setColorAt，避免大模型 BatchedMesh 反复刷新。
    const exiting = Array.from(previousHighlighted).filter((id) => !expandedTargets.has(id));
    const entering = Array.from(expandedTargets).filter((id) => !previousHighlighted.has(id));
    const needRefresh = new Set<string>(entering);

    if (context.state.locateFocusUuid && expandedTargets.has(context.state.locateFocusUuid)) {
        needRefresh.add(context.state.locateFocusUuid);
    }
    if (focusKey && expandedTargets.has(focusKey)) {
        needRefresh.add(focusKey);
    }
    if (highlightColors) {
        Object.keys(highlightColors).forEach((uuid) => {
            if (expandedTargets.has(uuid)) needRefresh.add(uuid);
        });
    }

    restoreHighlightedInstanceColors(context, exiting);

    const touched = new Set<THREE.BatchedMesh>();
    needRefresh.forEach((uuid) => {
        const mappings = context.optimizedMapping.get(uuid);
        if (!mappings) return;
        const color = getColorForUuid(uuid, context.settings, highlightColors);
        mappings.forEach((mapping) => {
            mapping.mesh.setColorAt(mapping.instanceId, color);
            touched.add(mapping.mesh);
        });
    });
    markInstanceColorNeedsUpdate(touched);

    context.state.locateResultSet = expandedTargets;
    context.state.locateFocusUuid = focusKey;
    context.state.highlightedUuids = expandedTargets;
    context.state.highlightedInstance = null;
    context.state.lastSelectedUuid = focusKey;
    updateSelectionHelpers(context, expandedTargets);

    return { needsRender: true };
}
