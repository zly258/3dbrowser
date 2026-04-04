import type { PropertyGroupInput } from "../../viewer/propertyIndex";
import type { StructureTreeNode } from "./types";

interface ResolveBimIdByUuidArgs {
    uuid: string;
    nodeMap: Map<string, StructureTreeNode[]>;
    bimIdToNodeIds: Map<string, string[]>;
}

export function resolveBimIdByUuid({
    uuid,
    nodeMap,
    bimIdToNodeIds
}: ResolveBimIdByUuidArgs): string | null {
    const nodes = nodeMap.get(uuid);
    if (nodes && nodes.length > 0 && nodes[0].bimId) {
        return nodes[0].bimId;
    }

    for (const [key, nodeIds] of bimIdToNodeIds.entries()) {
        if (nodeIds.includes(uuid)) {
            const parts = key.split("::");
            return parts.length > 1 ? parts[1] : null;
        }
    }

    return null;
}

export function resolveNodeUuidByBimId(bimId: string, bimIdToNodeIds: Map<string, string[]>): string | null {
    for (const [key, nodeIds] of bimIdToNodeIds.entries()) {
        if (key.endsWith(`::${bimId}`) && nodeIds.length > 0) {
            return nodeIds[0];
        }
    }
    return null;
}

export function resolveSelectionUuid(rawUuid: string, nodeMap: Map<string, StructureTreeNode[]>, bimIdToNodeIds: Map<string, string[]>): string {
    if (nodeMap.has(rawUuid)) return rawUuid;
    return resolveNodeUuidByBimId(rawUuid, bimIdToNodeIds) || rawUuid;
}

export function resolveNbimNode(id: string, nodeMap: Map<string, StructureTreeNode[]>): StructureTreeNode | null {
    const direct = nodeMap.get(id);
    return direct && direct.length > 0 ? direct[0] : null;
}

interface ResolveNbimPropertyEntryArgs {
    id: string;
    nodeMap: Map<string, StructureTreeNode[]>;
    nbimPropsByOriginalUuid: Map<string, Record<string, any>>;
}

function resolveNbimPropertyEntry({
    id,
    nodeMap,
    nbimPropsByOriginalUuid
}: ResolveNbimPropertyEntryArgs) {
    const node = resolveNbimNode(id, nodeMap);
    if (!node || !node.bimId) return null;

    const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";
    if (!originalUuid) return null;

    const map = nbimPropsByOriginalUuid.get(originalUuid);
    if (!map) return null;

    return {
        entry: map[`${originalUuid}::${node.bimId}`],
        node
    };
}

export function resolveNbimFlatProperties(args: ResolveNbimPropertyEntryArgs): any | null {
    const resolved = resolveNbimPropertyEntry(args);
    if (!resolved?.entry || typeof resolved.entry !== "object") return resolved?.entry || null;

    const { ifcRawGroups, ifcNormalizedGroups, ...flatProps } = resolved.entry;
    return flatProps;
}

export function resolveNbimIfcPropertyGroups(
    args: ResolveNbimPropertyEntryArgs,
    mode: "raw" | "normalized" = "raw"
): Record<string, PropertyGroupInput> | null {
    const resolved = resolveNbimPropertyEntry(args);
    if (!resolved?.entry || typeof resolved.entry !== "object") return null;

    const rawGroups = resolved.entry.ifcRawGroups;
    const normalizedGroups = resolved.entry.ifcNormalizedGroups;

    if (mode === "normalized") {
        return (normalizedGroups || rawGroups || null) as Record<string, PropertyGroupInput> | null;
    }
    return (rawGroups || normalizedGroups || null) as Record<string, PropertyGroupInput> | null;
}

