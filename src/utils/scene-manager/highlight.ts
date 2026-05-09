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

    while (queue.length > 0) {
        const current = queue.shift()!;
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
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

function applyHighlightedInstanceColors(context: SceneManagerHighlightContext, uuids: Iterable<string>) {
    const highlightColor = getHighlightColor(context.settings);
    const touched = new Set<THREE.BatchedMesh>();
    for (const id of uuids) {
        const mappings = context.optimizedMapping.get(id);
        if (!mappings) continue;
        mappings.forEach((mapping) => {
            mapping.mesh.setColorAt(mapping.instanceId, highlightColor);
            touched.add(mapping.mesh);
        });
    }
    markInstanceColorNeedsUpdate(touched);
}

function updateSelectionHelpers(context: SceneManagerHighlightContext, target: Set<string>) {
    context.selectionBox.visible = false;
    context.highlightMesh.visible = false;

    if (target.size === 0) {
        return;
    }

    const union = collectRenderableBoundsForIds(context, Array.from(target));

    if (!union.isEmpty()) {
        context.selectionBox.box.copy(union);
        const locatingFocus = !!(context.state.locateFocusUuid && target.has(context.state.locateFocusUuid));
        if (locatingFocus) {
            const pad = Math.max(union.getSize(new THREE.Vector3()).length() * 0.048, 0.22);
            context.selectionBox.box.expandByScalar(pad);
        }
        context.selectionBox.visible = locatingFocus || !!context.settings.highlightShowBox;
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
    uuids: string[]
): SceneHighlightResult {
    context.clearClashPairHighlight();
    const normalized = Array.from(new Set(uuids.filter(Boolean)));
    const target = expandLocateTargets(context.nodeMap, normalized);

    const preserveLocateTint = context.state.locateResultSet.size > 0;
    if (!preserveLocateTint) {
        restoreHighlightedInstanceColors(context, Array.from(context.state.highlightedUuids).filter((id) => !target.has(id)));
        applyHighlightedInstanceColors(context, Array.from(target).filter((id) => !context.state.highlightedUuids.has(id)));
    }

    context.state.highlightedUuids = target;
    context.state.lastSelectedUuid = uuids.length > 0 ? uuids[uuids.length - 1] : null;
    updateSelectionHelpers(context, target);

    return { needsRender: true };
}

export function applyClearLocateFocus(
    context: SceneManagerHighlightContext
): SceneHighlightResult {
    context.clearClashPairHighlight();
    clearLocateVisualCaches(context);

    context.state.locateResultSet.clear();
    context.state.locateFocusUuid = null;
    context.state.highlightedUuids = new Set();
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
    void options;

    const normalized = Array.from(new Set(uuids.filter(Boolean)));
    if (normalized.length === 0) {
        return applyClearLocateFocus(context);
    }

    const expandedTargets = expandLocateTargets(context.nodeMap, normalized);
    const expandedList = Array.from(expandedTargets);
    const previousTargets = new Set(context.state.locateResultSet);
    const previousFocusUuid = context.state.locateFocusUuid;
    const accentColor = getHighlightColor(context.settings);
    const highlightColors = options?.highlightColors;

    context.state.locateResultSet = expandedTargets;
    context.state.locateFocusUuid = focusUuid && expandedTargets.has(focusUuid) ? focusUuid : expandedList[0];
    const focusKey = context.state.locateFocusUuid;

    const nextTargetBatchedMeshIds = collectTargetBatchedMeshIds(context, expandedTargets);

    if (shouldUseLightweightLocate(context, expandedTargets)) {
        return applyLightweightLocateState(context, expandedTargets, focusKey, highlightColors);
    }

    if (previousTargets.size === 0) {
        assignLocateMaterialsForTraverse(context, expandedTargets, nextTargetBatchedMeshIds, accentColor);
        expandedTargets.forEach((uuid) => {
            assignLocateMaterialForObject(
                context,
                uuid,
                "target",
                getColorForUuid(uuid, context.settings, highlightColors)
            );
        });
        applyInitialLocateInstanceState(context, expandedTargets, focusKey, accentColor, highlightColors);
    } else {
        const entering = getSetDifference(expandedTargets, previousTargets);
        const exiting = getSetDifference(previousTargets, expandedTargets);
        const persistent = getSetIntersection(previousTargets, expandedTargets);

        exiting.forEach((uuid) => assignLocateMaterialForObject(context, uuid, "dim", accentColor));
        entering.forEach((uuid) => assignLocateMaterialForObject(
            context,
            uuid,
            "target",
            getColorForUuid(uuid, context.settings, highlightColors)
        ));
        persistent.forEach((uuid) => assignLocateMaterialForObject(
            context,
            uuid,
            "target",
            getColorForUuid(uuid, context.settings, highlightColors)
        ));

        const prevTargetBatchedMeshIds = collectTargetBatchedMeshIds(context, previousTargets);
        const batchedEntering = getSetDifference(nextTargetBatchedMeshIds, prevTargetBatchedMeshIds);
        const batchedExiting = getSetDifference(prevTargetBatchedMeshIds, nextTargetBatchedMeshIds);

        batchedEntering.forEach((meshUuid) => assignLocateMaterialForBatchedMesh(context, meshUuid, "batchedTarget", accentColor));
        batchedExiting.forEach((meshUuid) => assignLocateMaterialForBatchedMesh(context, meshUuid, "dim", accentColor));

        applyLocateInstanceStateDiff(
            context,
            entering,
            exiting,
            previousFocusUuid,
            focusKey,
            accentColor,
            highlightColors
        );
    }

    return applyHighlightObjects(context, focusKey ? [focusKey] : []);
}
