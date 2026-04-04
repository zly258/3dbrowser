import * as THREE from "three";
import { sanitizeFileStem, stripFileExtension } from "../viewer/exportNaming";
import type { StructureTreeNode } from "./sceneManagerTypes";

const INVALID_DISPLAY_LABELS = new Set(["", "n/a", "na", "undefined", "null", "-", "--"]);

export function sanitizeDisplayLabel(...candidates: Array<string | null | undefined>) {
    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const trimmed = candidate.trim();
        if (INVALID_DISPLAY_LABELS.has(trimmed.toLowerCase())) continue;
        return trimmed;
    }
    return "";
}

export function countStructureRenderableNodes(node: StructureTreeNode | undefined): number {
    if (!node) return 0;

    let count = node.type === "Mesh" ? 1 : 0;
    if (node.children) {
        for (const child of node.children) {
            count += countStructureRenderableNodes(child);
        }
    }
    return count;
}

function sanitizeStructureUserData(userData: any) {
    if (!userData || typeof userData !== "object") return undefined;

    const sanitized: any = {};
    if (userData.originalUuid !== undefined) sanitized.originalUuid = String(userData.originalUuid);
    if (userData.expressID !== undefined) sanitized.expressID = userData.expressID;
    if (userData.modelID !== undefined) sanitized.modelID = userData.modelID;
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function buildExportStructureTree(structureRoot: StructureTreeNode) {
    const usedIds = new Set<string>();
    const assignId = (rawName: string | undefined, fallback: string) => {
        const base = rawName && rawName.trim() ? rawName.trim() : fallback;
        if (!usedIds.has(base)) {
            usedIds.add(base);
            return base;
        }

        let suffix = 2;
        while (usedIds.has(`${base}_${suffix}`)) suffix++;
        const resolvedId = `${base}_${suffix}`;
        usedIds.add(resolvedId);
        return resolvedId;
    };

    const rootId = assignId(structureRoot?.name, structureRoot?.id ?? "Root");
    const rootCopy: any = {
        id: rootId,
        name: structureRoot?.name,
        type: structureRoot?.type,
        visible: structureRoot?.visible !== false,
        children: []
    };

    if (structureRoot?.bimId !== undefined) rootCopy.bimId = structureRoot.bimId;
    if (structureRoot?.chunkId !== undefined) rootCopy.chunkId = structureRoot.chunkId;
    const rootUserData = sanitizeStructureUserData(structureRoot?.userData);
    if (rootUserData) rootCopy.userData = rootUserData;

    const stack: Array<{ src: StructureTreeNode; dst: any }> = [{ src: structureRoot, dst: rootCopy }];
    while (stack.length > 0) {
        const { src, dst } = stack.pop()!;
        const children = Array.isArray(src?.children) ? src.children : [];

        for (const child of children) {
            const childId = assignId(child?.name, child?.id ?? "Node");
            const childCopy: any = {
                id: childId,
                name: child?.name,
                type: child?.type,
                visible: child?.visible !== false,
                children: []
            };

            if (child?.bimId !== undefined) childCopy.bimId = child.bimId;
            if (child?.chunkId !== undefined) childCopy.chunkId = child.chunkId;
            const childUserData = sanitizeStructureUserData(child?.userData);
            if (childUserData) childCopy.userData = childUserData;

            dst.children.push(childCopy);
            stack.push({ src: child, dst: childCopy });
        }
    }

    return rootCopy;
}

export function encodeNbimManifest(manifest: {
    globalBounds: unknown;
    chunks: unknown[];
    structureTree: any;
    bimIdTable: string[];
    bimProperties: Record<string, any>;
}, structureRoot: StructureTreeNode) {
    let manifestString: string;
    try {
        manifestString = JSON.stringify(manifest);
    } catch {
        manifestString = JSON.stringify({
            globalBounds: manifest.globalBounds,
            chunks: manifest.chunks,
            structureTree: {
                id: structureRoot.id,
                name: structureRoot.name,
                type: structureRoot.type,
                children: structureRoot.children ? [] : []
            },
            bimIdTable: manifest.bimIdTable,
            bimProperties: {}
        });
    }

    return new TextEncoder().encode(manifestString);
}

export function deriveDefaultNbimStem(contentGroup: THREE.Group) {
    const names: string[] = [];

    contentGroup.children.forEach((child) => {
        if (child.userData?.isOptimizedGroup) return;
        if (child.name.startsWith("optimized_")) return;

        const rawName =
            (typeof child.userData?.modelName === "string" ? child.userData.modelName : "") ||
            (child.children?.[0]?.name || "") ||
            child.name;
        const baseName = sanitizeFileStem(stripFileExtension(rawName));
        if (baseName) names.push(baseName);
    });

    const uniqueNames = Array.from(new Set(names));
    if (uniqueNames.length === 1) return uniqueNames[0];

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const suffix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `批量导出_${suffix}`;
}

export function groupNbimPropertiesByOwner(
    manifestBimProperties: Record<string, any>,
    rootId: string
) {
    const propertyKeys = Object.keys(manifestBimProperties);
    const ownerSet = new Set<string>();

    propertyKeys.forEach((key) => {
        const separatorIndex = key.indexOf("::");
        if (separatorIndex > 0) ownerSet.add(key.slice(0, separatorIndex));
    });

    const defaultOwner = ownerSet.size === 1 ? [...ownerSet][0] : rootId;
    const grouped = new Map<string, Record<string, any>>();

    if (ownerSet.size >= 1) {
        if (ownerSet.size === 1) {
            grouped.set(defaultOwner, manifestBimProperties);
        } else {
            propertyKeys.forEach((key) => {
                const separatorIndex = key.indexOf("::");
                const owner = separatorIndex > 0 ? key.slice(0, separatorIndex) : rootId;
                if (!grouped.has(owner)) grouped.set(owner, {});
                grouped.get(owner)![key] = manifestBimProperties[key];
            });
        }
    } else {
        grouped.set(rootId, manifestBimProperties);
    }

    return {
        defaultOwner,
        grouped
    };
}

export function createNbimContainerGroup(options: {
    fileName: string;
    modelRootName?: string;
    rootId: string;
}) {
    const { fileName, modelRootName, rootId } = options;
    const fileGroup = new THREE.Group();
    fileGroup.name = `file_${rootId}`;
    fileGroup.userData.originalUuid = rootId;

    const fileBaseName = sanitizeFileStem(stripFileExtension(fileName));
    fileGroup.userData.modelName = sanitizeFileStem(
        sanitizeDisplayLabel(modelRootName && modelRootName !== "Root" ? modelRootName : "", fileBaseName, rootId) || fileBaseName
    );

    return fileGroup;
}
