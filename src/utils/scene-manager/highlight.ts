import * as THREE from "three";

type OptimizedMappingEntry = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
    geometry?: THREE.BufferGeometry;
};

type LocateDimmedInstance = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
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

    const union = new THREE.Box3();
    const tmpBox = new THREE.Box3();
    const tmpMatrix = new THREE.Matrix4();

    const addObjectBounds = (id: string) => {
        const mappings = context.optimizedMapping.get(id);
        if (mappings && mappings.length > 0) {
            const mapping = mappings[0];
            if (mapping.geometry) {
                if (!mapping.geometry.boundingBox) mapping.geometry.computeBoundingBox();
                tmpBox.copy(mapping.geometry.boundingBox!);
                mapping.mesh.getMatrixAt(mapping.instanceId, tmpMatrix);
                tmpMatrix.premultiply(mapping.mesh.matrixWorld);
                tmpBox.applyMatrix4(tmpMatrix);
                union.union(tmpBox);
            }
            return;
        }

        const object = context.contentGroup.getObjectByProperty("uuid", id);
        if (!object) return;
        object.updateMatrixWorld(true);
        if (object.userData.boundingBox) {
            tmpBox.copy(object.userData.boundingBox).applyMatrix4(object.matrixWorld);
        } else {
            tmpBox.setFromObject(object);
        }
        union.union(tmpBox);
    };

    for (const id of target) addObjectBounds(id);

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

function hasSameLocateResultSet(currentSet: Set<string>, uuids: string[]) {
    if (currentSet.size !== uuids.length) return false;
    for (const uuid of uuids) {
        if (!currentSet.has(uuid)) return false;
    }
    return true;
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
    const target = new Set(uuids.filter(Boolean));

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
    // 同时也清除碰撞高亮，确保状态干净
    context.clearClashPairHighlight();

    context.locateObjectMaterialCache.forEach((material, uuid) => {
        const object = context.contentGroup.getObjectByProperty("uuid", uuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
        if (!object || (!object.isMesh && !(object as any).isBatchedMesh)) return;
        (object as any).material = material;
    });
    context.locateObjectMaterialCache.clear();
    context.locateMaterialCache.clear();
    context.locateDimmedInstances.forEach(({ mesh, instanceId, originalColor }) => {
        mesh.setColorAt(instanceId, new THREE.Color(originalColor));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

    // 先清除状态但不立即渲染，后续统一渲染
    applyClearLocateFocus(context);

    const selectedSet = new Set(normalized);
    const expandedTargets = expandLocateTargets(context.nodeMap, normalized);
    const expandedList = Array.from(expandedTargets);
    const rootColorByExpandedId = new Map<string, THREE.Color>();
    const colorEntries = options?.highlightColors || {};

    normalized.forEach((rootId) => {
        const colorHex = colorEntries[rootId];
        if (!colorHex) return;
        const rootColor = new THREE.Color(colorHex);
        const expandedFromRoot = expandLocateTargets(context.nodeMap, [rootId]);
        expandedFromRoot.forEach((id) => rootColorByExpandedId.set(id, rootColor));
    });

    context.state.locateResultSet = expandedTargets;
    context.state.locateFocusUuid = focusUuid && expandedTargets.has(focusUuid) ? focusUuid : expandedList[0];
    const focusKey = context.state.locateFocusUuid;
    const dimmedColor = new THREE.Color("#b7bec9");
    const accentColor = getHighlightColor(context.settings);

    // 一次性变量，减少内存分配
    const tempColor = new THREE.Color();

    context.contentGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        if (!context.locateObjectMaterialCache.has(child.uuid)) {
            context.locateObjectMaterialCache.set(child.uuid, mesh.material);
        }
        const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const isMatched = expandedTargets.has(child.uuid);
        const isFocus = isMatched && focusKey !== null && child.uuid === focusKey;
        const matchedColor = rootColorByExpandedId.get(child.uuid) || accentColor;
        
        const nextMaterials = sourceMaterials.map((material) => {
            if (!material) return material;
            const cloned = material.clone() as THREE.Material & {
                transparent?: boolean;
                opacity?: number;
                depthWrite?: boolean;
                color?: THREE.Color;
                emissive?: THREE.Color;
                roughness?: number;
                metalness?: number;
            };
            if ("transparent" in cloned) cloned.transparent = false;
            if ("opacity" in cloned) cloned.opacity = 1;
            if ("depthWrite" in cloned) cloned.depthWrite = true;
            if ("color" in cloned && cloned.color) {
                const baseColor = cloned.color.clone();
                if (isMatched) {
                    cloned.color.copy(baseColor.lerp(matchedColor, isFocus ? 0.94 : 0.82));
                } else {
                    cloned.transparent = true;
                    cloned.opacity = 0.08; // 降低非高亮物体透明度，使其更通透
                    cloned.depthWrite = false;
                    cloned.color.copy(baseColor.lerp(dimmedColor, 0.88));
                }
            }
            if ("emissive" in cloned && cloned.emissive) {
                if (isMatched) cloned.emissive.copy(matchedColor.clone().multiplyScalar(isFocus ? 0.45 : 0.18));
                else cloned.emissive.set(0x000000);
            }
            if ("roughness" in cloned && !isMatched) cloned.roughness = Math.max(0.95, cloned.roughness ?? 0.95);
            if ("metalness" in cloned && !isMatched) cloned.metalness = Math.min(0.01, cloned.metalness ?? 0.01);
            cloned.needsUpdate = true;
            return cloned;
        });
        mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
    });

    context.contentGroup.traverse((child) => {
        const batched = child as THREE.Object3D & {
            isBatchedMesh?: boolean;
            material?: THREE.Material | THREE.Material[];
            userData?: any;
        };
        if (!batched.isBatchedMesh || !batched.material) return;

        if (!context.locateObjectMaterialCache.has(child.uuid)) {
            context.locateObjectMaterialCache.set(child.uuid, batched.material);
        }
        const owner = batched.userData?.originalUuid ? String(batched.userData.originalUuid) : "";
        const batchIdToUuid = batched.userData?.batchIdToUuid as Map<number, string> | undefined;
        let hasMatchedInstance = false;
        let hasFocusInstance = false;
        let instanceMatchColor: THREE.Color | null = owner ? (rootColorByExpandedId.get(owner) || null) : null;
        if (batchIdToUuid && batchIdToUuid.size > 0) {
            for (const instanceUuid of batchIdToUuid.values()) {
                if (!hasMatchedInstance && expandedTargets.has(instanceUuid)) hasMatchedInstance = true;
                if (!hasFocusInstance && focusKey !== null && instanceUuid === focusKey) hasFocusInstance = true;
                if (!instanceMatchColor && expandedTargets.has(instanceUuid)) {
                    instanceMatchColor = rootColorByExpandedId.get(instanceUuid) || null;
                }
                if (hasMatchedInstance && hasFocusInstance) break;
            }
        }
        const ownerExplicitSelected = owner ? selectedSet.has(owner) : false;
        const isMatched = expandedTargets.has(child.uuid) || hasMatchedInstance || ownerExplicitSelected;
        const isFocus =
            (context.state.locateFocusUuid !== null && context.state.locateFocusUuid === child.uuid) ||
            hasFocusInstance ||
            (ownerExplicitSelected && context.state.locateFocusUuid !== null && context.state.locateFocusUuid === owner);
        const sourceMaterials = Array.isArray(batched.material) ? batched.material : [batched.material];
        const matchedColor = instanceMatchColor || accentColor;

        const nextMaterials = sourceMaterials.map((material) => {
            if (!material) return material;
            const cloned = material.clone() as THREE.Material & {
                transparent?: boolean;
                opacity?: number;
                depthWrite?: boolean;
                color?: THREE.Color;
                emissive?: THREE.Color;
                roughness?: number;
                metalness?: number;
            };
            if ("transparent" in cloned) cloned.transparent = false;
            if ("opacity" in cloned) cloned.opacity = 1;
            if ("depthWrite" in cloned) cloned.depthWrite = true;
            if ("color" in cloned && cloned.color) {
                const baseColor = cloned.color.clone();
                if (isMatched) {
                    cloned.color.copy(baseColor.lerp(matchedColor, isFocus ? 0.94 : 0.75));
                } else {
                    cloned.transparent = true;
                    cloned.opacity = 0.08;
                    cloned.depthWrite = false;
                    cloned.color.copy(baseColor.lerp(dimmedColor, 0.9));
                }
            }
            if ("emissive" in cloned && cloned.emissive) {
                if (isMatched) cloned.emissive.copy(matchedColor.clone().multiplyScalar(isFocus ? 0.4 : 0.15));
                else cloned.emissive.set(0x000000);
            }
            if ("roughness" in cloned && !isMatched) cloned.roughness = Math.max(0.95, cloned.roughness ?? 0.95);
            if ("metalness" in cloned && !isMatched) cloned.metalness = Math.min(0.01, cloned.metalness ?? 0.01);
            cloned.needsUpdate = true;
            return cloned;
        });
        (batched as any).material = Array.isArray(batched.material) ? nextMaterials : nextMaterials[0];
    });

    context.optimizedMapping.forEach((mappings, originalUuid) => {
        const isMatched = expandedTargets.has(originalUuid);
        const isFocus = isMatched && focusKey !== null && originalUuid === focusKey;
        const matchedColor = rootColorByExpandedId.get(originalUuid) || accentColor;
        mappings.forEach((mapping) => {
            const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
            context.locateDimmedInstances.set(key, {
                mesh: mapping.mesh,
                instanceId: mapping.instanceId,
                originalColor: mapping.originalColor
            });
            const sourceColor = new THREE.Color(mapping.originalColor);
            const tint = isFocus ? 0.94 : isMatched ? 0.82 : 0.88;
            const targetColor = isMatched ? matchedColor : dimmedColor;
            
            // 如果是非高亮物体，在 BatchedMesh 中无法单独设置透明度，只能设置颜色趋近背景灰
            mapping.mesh.setColorAt(mapping.instanceId, sourceColor.lerp(targetColor, tint));
            if (mapping.mesh.instanceColor) mapping.mesh.instanceColor.needsUpdate = true;
        });
    });

    return applyHighlightObjects(context, context.state.locateFocusUuid ? [context.state.locateFocusUuid] : []);
}

