import * as THREE from "three";
import type { StructureTreeNode } from "./sceneManagerTypes";

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
    visible: boolean
) {
    optimizedMapping.forEach((mappings) => {
        mappings.forEach((mapping) => {
            mapping.mesh.setVisibleAt(mapping.instanceId, visible);
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
    object: THREE.Object3D | null,
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
    visible: boolean
) {
    const mappings = optimizedMapping.get(objectOrNodeId);
    if (!mappings) return;
    mappings.forEach((mapping) => {
        mapping.mesh.setVisibleAt(mapping.instanceId, visible);
    });
}

export function applySetAllVisibility(
    context: SceneManagerVisibilityContext,
    visible: boolean
): SceneVisibilityResult {
    syncStructureNodeVisibility(context.nodeMap, context.structureRoot, visible);
    applyOptimizedMappingsVisibility(context.optimizedMapping, visible);

    context.contentGroup.traverse((object) => {
        applyRenderableVisibility(object, visible);
    });

    return {
        needsBoundsUpdate: true,
        needsExplodeRefresh: true,
        needsRender: true
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

    if (!object) {
        if (nodes && nodes.length > 0) {
            const walk = (node: StructureTreeNode) => {
                applyObjectMappingVisibility(context.optimizedMapping, node.id, visible);
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
                : undefined
        };
    }

    object.traverse((child) => {
        if (child.name === "Helpers" || child.name === "Measure") return;
        applyRenderableVisibility(child, visible);
        applyObjectMappingVisibility(context.optimizedMapping, child.uuid, visible);
    });

    return {
        needsBoundsUpdate: true,
        needsExplodeRefresh: false,
        needsRender: true,
        nextHighlightedUuids: idsToUnhighlight.length > 0
            ? Array.from(new Set([...context.highlightedUuids].filter((id) => !idsToUnhighlight.includes(id))))
            : undefined
    };
}

export function applyIsolateObjects(
    context: SceneManagerVisibilityContext,
    uuids: string[],
    setObjectVisibility: (uuid: string, visible: boolean, showParents?: boolean) => void
): SceneVisibilityResult {
    applySetAllVisibility(context, false);

    const affectedBatchedMeshes = new Set<THREE.BatchedMesh>();

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
        needsRender: true
    };
}
