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
    settings: {
        highlightColor?: string;
        highlightShowBox?: boolean;
    };
    state: SceneManagerHighlightState;
    locateMaterialCache: Map<string, { transparent: boolean; opacity: number; depthWrite: boolean }>;
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

function getHighlightColor(settings: SceneManagerHighlightContext["settings"]) {
    return new THREE.Color(settings.highlightColor || "#ff9f1c");
}

function restoreHighlightedInstanceColors(context: SceneManagerHighlightContext, uuids: Iterable<string>) {
    for (const id of uuids) {
        const mappings = context.optimizedMapping.get(id);
        if (!mappings) continue;
        mappings.forEach((mapping) => {
            mapping.mesh.setColorAt(mapping.instanceId, new THREE.Color(mapping.originalColor));
            if (mapping.mesh.instanceColor) {
                mapping.mesh.instanceColor.needsUpdate = true;
            }
        });
    }
}

function applyHighlightedInstanceColors(context: SceneManagerHighlightContext, uuids: Iterable<string>) {
    const highlightColor = getHighlightColor(context.settings);
    for (const id of uuids) {
        const mappings = context.optimizedMapping.get(id);
        if (!mappings) continue;
        mappings.forEach((mapping) => {
            mapping.mesh.setColorAt(mapping.instanceId, highlightColor);
            if (mapping.mesh.instanceColor) {
                mapping.mesh.instanceColor.needsUpdate = true;
            }
        });
    }
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

    const focusId = context.state.lastSelectedUuid;
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

    context.locateObjectMaterialCache.forEach((material, uuid) => {
        const object = context.contentGroup.getObjectByProperty("uuid", uuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
        if (!object) return;
        if (object.isMesh || (object as any).isBatchedMesh) {
            (object as any).material = material;
            object.visible = true;
        }
    });
    context.locateObjectMaterialCache.clear();
    context.locateMaterialCache.clear();
    
    context.locateDimmedInstances.forEach(({ mesh, instanceId, originalColor, originalVisible }) => {
        if ((mesh as any).isBatchedMesh) {
            mesh.setColorAt(instanceId, new THREE.Color(originalColor));
            if ((mesh as any).setVisibleAt) {
                (mesh as any).setVisibleAt(instanceId, originalVisible);
            }
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    });
    context.locateDimmedInstances.clear();
    
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
    const normalized = Array.from(new Set(uuids.filter(Boolean)));
    if (normalized.length === 0) {
        return applyClearLocateFocus(context);
    }

    applyClearLocateFocus(context);

    const expandedTargets = expandLocateTargets(context.nodeMap, normalized);
    const expandedList = Array.from(expandedTargets);
    const accentColor = getHighlightColor(context.settings);
    const dimmedColor = new THREE.Color("#e0e0e0"); // 背景淡灰色

    context.state.locateResultSet = expandedTargets;
    context.state.locateFocusUuid = focusUuid && expandedTargets.has(focusUuid) ? focusUuid : expandedList[0];
    const focusKey = context.state.locateFocusUuid;

    // --- 1. 处理所有网格对象 (Mesh & BatchedMesh) ---
    // 先统计 BatchedMesh 中包含哪些目标
    const meshIdToContainsTarget = new Map<string, boolean>();
    context.optimizedMapping.forEach((mappings, uuid) => {
        if (expandedTargets.has(uuid)) {
            mappings.forEach(m => meshIdToContainsTarget.set(m.mesh.uuid, true));
        }
    });

    context.contentGroup.traverse((child) => {
        const mesh = child as any;
        if (!mesh.isMesh || !mesh.material) return;
        
        // 备份材质
        if (!context.locateObjectMaterialCache.has(child.uuid)) {
            context.locateObjectMaterialCache.set(child.uuid, mesh.material);
        }

        const isBatched = !!mesh.isBatchedMesh;
        const isMatched = expandedTargets.has(child.uuid);
        const containsTarget = meshIdToContainsTarget.get(mesh.uuid);

        const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const nextMaterials = sourceMaterials.map((material) => {
            if (!material) return material;
            const cloned = material.clone() as any;
            
            if (isMatched) {
                // 如果是命中的普通Mesh，高亮并保持不透明
                cloned.transparent = false;
                cloned.opacity = 1.0;
                if (cloned.color) cloned.color.copy(accentColor);
                if (cloned.emissive) cloned.emissive.copy(accentColor.clone().multiplyScalar(0.4));
            } else if (isBatched && containsTarget) {
                // 特殊处理包含目标的合并网格：让它整体半透明，但保留较高可见度
                cloned.transparent = true;
                cloned.opacity = 0.25; 
                cloned.depthWrite = false;
            } else {
                // 纯背景：设为极高透明度
                cloned.transparent = true;
                cloned.opacity = 0.05; 
                cloned.depthWrite = false;
                if (cloned.color) cloned.color.set("#f5f5f5");
                if (cloned.emissive) cloned.emissive.set(0x000000);
            }
            return cloned;
        });
        mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
    });

    // --- 2. 处理 BatchedMesh 的实例颜色和可见性 ---
    context.optimizedMapping.forEach((mappings, originalUuid) => {
        const isMatched = expandedTargets.has(originalUuid);
        const isFocus = isMatched && focusKey !== null && originalUuid === focusKey;
        
        mappings.forEach((mapping) => {
            const batchedMesh = mapping.mesh;
            const key = `${batchedMesh.uuid}:${mapping.instanceId}`;
            
            context.locateDimmedInstances.set(key, {
                mesh: batchedMesh,
                instanceId: mapping.instanceId,
                originalColor: mapping.originalColor,
                originalVisible: true
            });

            if (isMatched) {
                // 目标实例：改为醒目高亮色
                batchedMesh.setColorAt(mapping.instanceId, isFocus ? accentColor : accentColor.clone().lerp(new THREE.Color("#ffffff"), 0.2));
            } else {
                // 背景实例：改为淡灰色
                batchedMesh.setColorAt(mapping.instanceId, dimmedColor);
            }
            
            if (batchedMesh.instanceColor) batchedMesh.instanceColor.needsUpdate = true;
        });
    });

    return applyHighlightObjects(context, context.state.locateFocusUuid ? [context.state.locateFocusUuid] : []);
}
