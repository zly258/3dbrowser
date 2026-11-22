import * as THREE from "three";
import type { StructureTreeNode } from "./types";

type OptimizedMappingEntry = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
    geometry?: THREE.BufferGeometry;
};

interface SceneManagerVisibilityContext {
    scene: THREE.Scene;
    contentGroup: THREE.Group;
    structureRoot: StructureTreeNode;
    nodeMap: Map<string, StructureTreeNode[]>;
    optimizedMapping: Map<string, OptimizedMappingEntry[]>;
    highlightedUuids: Set<string>;
}

export interface SceneVisibilityResult {
    needsBoundsUpdate: boolean;
    needsExplodeRefresh: boolean;
    needsRender: boolean;
    nextHighlightedUuids?: string[];
    /** 受本次可见性变化影响的批量网格：合并边线需要按新可见性重建 */
    affectedBatchedMeshes?: Set<THREE.BatchedMesh>;
}

export interface SceneVisibilityChange {
    uuid: string;
    visible: boolean;
    showParents?: boolean;
}

export interface SceneVisibilityBatchOptions {
    recomputeBounds?: boolean;
    refreshExplode?: boolean;
    invalidateInteractables?: boolean;
}

function syncStructureNodeVisibility(nodeMap: Map<string, StructureTreeNode[]>, rootNode: StructureTreeNode, visible: boolean) {
    const setNodeVisible = (node: StructureTreeNode) => {
        node.visible = visible;
        node.children?.forEach(setNodeVisible);
    };

    rootNode.children?.forEach(setNodeVisible);

    nodeMap.forEach((nodes) => {
        nodes.forEach((node) => {
            node.visible = visible;
        });
    });
}

function applyOptimizedMappingsVisibility(
    optimizedMapping: Map<string, OptimizedMappingEntry[]>,
    visible: boolean,
    affected?: Set<THREE.BatchedMesh>
) {
    optimizedMapping.forEach((mappings) => {
        mappings.forEach((mapping) => {
            mapping.mesh.setVisibleAt(mapping.instanceId, visible);
            if (affected) affected.add(mapping.mesh);
        });
    });
}

function applyRenderableVisibility(object: THREE.Object3D, visible: boolean) {
    if (object.name === "Helpers" || object.name === "Measure") return;
    if ((object as THREE.Mesh).isMesh && object.userData.isOptimized) {
        object.visible = false;
        return;
    }
    object.visible = visible;
}

function ensureParentChainVisible(object: THREE.Object3D | null, scene: THREE.Scene) {
    let parent = object?.parent;
    while (parent && parent !== scene) {
        parent.visible = true;
        parent = parent.parent;
    }
}

function collectHighlightedDescendants(
    highlightedUuids: Set<string>,
    uuid: string,
    object: THREE.Object3D | null | undefined,
    nodes: StructureTreeNode[] | undefined
) {
    const idsToUnhighlight: string[] = [];
    if (highlightedUuids.has(uuid)) {
        idsToUnhighlight.push(uuid);
    }

    if (object) {
        object.traverse((child) => {
            if (highlightedUuids.has(child.uuid)) {
                idsToUnhighlight.push(child.uuid);
            }
        });
        return idsToUnhighlight;
    }

    if (nodes && nodes.length > 0) {
        const walk = (node: StructureTreeNode) => {
            if (highlightedUuids.has(node.id)) idsToUnhighlight.push(node.id);
            node.children?.forEach(walk);
        };
        walk(nodes[0]);
    }

    return idsToUnhighlight;
}

function syncNodeBranchVisibility(nodeMap: Map<string, StructureTreeNode[]>, node: StructureTreeNode, visible: boolean) {
    node.visible = visible;
    node.children?.forEach((child) => syncNodeBranchVisibility(nodeMap, child, visible));
    const mirrored = nodeMap.get(node.id);
    mirrored?.forEach((item) => {
        item.visible = visible;
    });
}

function applyObjectMappingVisibility(
    optimizedMapping: Map<string, OptimizedMappingEntry[]>,
    objectOrNodeId: string,
    visible: boolean,
    affected?: Set<THREE.BatchedMesh>
) {
    const mappings = optimizedMapping.get(objectOrNodeId);
    if (!mappings) return;
    mappings.forEach((mapping) => {
        mapping.mesh.setVisibleAt(mapping.instanceId, visible);
        if (affected) affected.add(mapping.mesh);
    });
}

export function applySetAllVisibility(
    context: SceneManagerVisibilityContext,
    visible: boolean
): SceneVisibilityResult {
    syncStructureNodeVisibility(context.nodeMap, context.structureRoot, visible);
    const affectedBatchedMeshes = new Set<THREE.BatchedMesh>();
    applyOptimizedMappingsVisibility(context.optimizedMapping, visible, affectedBatchedMeshes);

    context.contentGroup.traverse((object) => {
        applyRenderableVisibility(object, visible);
    });

    return {
        needsBoundsUpdate: true,
        needsExplodeRefresh: true,
        needsRender: true,
        affectedBatchedMeshes
    };
}

export function applySetObjectVisibility(
    context: SceneManagerVisibilityContext,
    uuid: string,
    visible: boolean,
    showParents = true
): SceneVisibilityResult {
    const nodes = context.nodeMap.get(uuid);
    nodes?.forEach((node) => syncNodeBranchVisibility(context.nodeMap, node, visible));

    const object = context.contentGroup.getObjectByProperty("uuid", uuid);

    if (visible && object && showParents) {
        ensureParentChainVisible(object, context.scene);
    }

    const idsToUnhighlight = !visible
        ? collectHighlightedDescendants(context.highlightedUuids, uuid, object, nodes)
        : [];

    const affectedBatchedMeshes = new Set<THREE.BatchedMesh>();

    if (!object) {
        if (nodes && nodes.length > 0) {
            const walk = (node: StructureTreeNode) => {
                applyObjectMappingVisibility(context.optimizedMapping, node.id, visible, affectedBatchedMeshes);
                node.children?.forEach(walk);
            };
            walk(nodes[0]);
        }

        return {
            needsBoundsUpdate: true,
            needsExplodeRefresh: false,
            needsRender: true,
            nextHighlightedUuids: idsToUnhighlight.length > 0
                ? Array.from(new Set([...context.highlightedUuids].filter((id) => !idsToUnhighlight.includes(id))))
                : undefined,
            affectedBatchedMeshes
        };
    }

    object.traverse((child) => {
        if (child.name === "Helpers" || child.name === "Measure") return;
        applyRenderableVisibility(child, visible);
        applyObjectMappingVisibility(context.optimizedMapping, child.uuid, visible, affectedBatchedMeshes);
    });

    return {
        needsBoundsUpdate: true,
        needsExplodeRefresh: false,
        needsRender: true,
        nextHighlightedUuids: idsToUnhighlight.length > 0
            ? Array.from(new Set([...context.highlightedUuids].filter((id) => !idsToUnhighlight.includes(id))))
            : undefined,
        affectedBatchedMeshes
    };
}

export function applyVisibilityBatch(
    context: SceneManagerVisibilityContext,
    changes: SceneVisibilityChange[],
    options: SceneVisibilityBatchOptions = {}
): SceneVisibilityResult {
    if (changes.length === 0) {
        return {
            needsBoundsUpdate: false,
            needsExplodeRefresh: false,
            needsRender: false
        };
    }

    let highlighted = new Set(context.highlightedUuids);
    let needsRender = false;
    const affectedBatchedMeshes = new Set<THREE.BatchedMesh>();

    changes.forEach((change) => {
        const result = applySetObjectVisibility(
            {
                ...context,
                highlightedUuids: highlighted
            },
            change.uuid,
            change.visible,
            change.showParents ?? true
        );

        if (result.nextHighlightedUuids) {
            highlighted = new Set(result.nextHighlightedUuids);
        }
        needsRender = needsRender || result.needsRender;
        result.affectedBatchedMeshes?.forEach((mesh) => affectedBatchedMeshes.add(mesh));
    });

    return {
        needsBoundsUpdate: options.recomputeBounds ?? true,
        needsExplodeRefresh: options.refreshExplode ?? false,
        needsRender,
        nextHighlightedUuids: Array.from(highlighted),
        affectedBatchedMeshes
    };
}

export function applyIsolateObjects(
    context: SceneManagerVisibilityContext,
    uuids: string[],
    setObjectVisibility: (uuid: string, visible: boolean, showParents?: boolean) => void
): SceneVisibilityResult {
    const hideAllResult = applySetAllVisibility(context, false);
    // 隔离会先全部隐藏再显示目标：所有批量网格的合并边线都要按新可见性重建。
    const affectedBatchedMeshes = new Set<THREE.BatchedMesh>(hideAllResult.affectedBatchedMeshes ?? []);

    uuids.forEach((uuid) => {
        setObjectVisibility(uuid, true);

        const nodes = context.nodeMap.get(uuid);
        if (nodes) {
            nodes.forEach((node) => {
                const showChildrenRecursive = (currentNode: StructureTreeNode) => {
                    if (currentNode.id !== uuid) {
                        setObjectVisibility(currentNode.id, true);
                    }
                    currentNode.children?.forEach(showChildrenRecursive);
                };
                showChildrenRecursive(node);
            });
        }

        const mappings = context.optimizedMapping.get(uuid);
        mappings?.forEach((mapping) => {
            affectedBatchedMeshes.add(mapping.mesh);
        });
    });

    affectedBatchedMeshes.forEach((mesh) => {
        mesh.visible = true;
        ensureParentChainVisible(mesh, context.scene);
    });

    uuids.forEach((uuid) => {
        const object = context.contentGroup.getObjectByProperty("uuid", uuid);
        if (object) {
            ensureParentChainVisible(object, context.scene);
        }
    });

    return {
        needsBoundsUpdate: true,
        needsExplodeRefresh: true,
        needsRender: true,
        affectedBatchedMeshes
    };
}

