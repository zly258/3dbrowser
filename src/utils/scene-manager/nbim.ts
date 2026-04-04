import * as THREE from "three";
import { sanitizeFileStem, stripFileExtension } from "../../viewer/exportNaming";
import type { StructureTreeNode } from "./types";

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

type IfcApiRef = { ifcApi: any; modelID: number };
type IfcManagerRef = { ifcManager: any; modelID: number };

export function collectIfcModelReferences(contentGroup: THREE.Group) {
    const ifcApiByModel = new Map<string, IfcApiRef>();
    const ifcManagerByModel = new Map<string, IfcManagerRef>();

    contentGroup.traverse((object) => {
        if (object.userData?.ifcAPI && object.userData?.modelID !== undefined && object.userData?.originalUuid) {
            ifcApiByModel.set(String(object.userData.originalUuid), {
                ifcApi: object.userData.ifcAPI,
                modelID: object.userData.modelID
            });
        }

        if (object.userData?.ifcManager && object.userData?.modelID !== undefined && object.userData?.originalUuid) {
            ifcManagerByModel.set(String(object.userData.originalUuid), {
                ifcManager: object.userData.ifcManager,
                modelID: object.userData.modelID
            });
        }
    });

    return {
        ifcApiByModel,
        ifcManagerByModel
    };
}

export async function collectNbimBimProperties(options: {
    structureRoot: StructureTreeNode;
    ifcApiByModel: Map<string, IfcApiRef>;
    ifcManagerByModel: Map<string, IfcManagerRef>;
}) {
    const { structureRoot, ifcApiByModel, ifcManagerByModel } = options;
    const bimProperties: Record<string, any> = {};
    const stack: StructureTreeNode[] = [structureRoot];

    while (stack.length > 0) {
        const node = stack.pop()!;
        const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";

        if (node.bimId) {
            const key = `${originalUuid}::${node.bimId}`;
            if (!bimProperties[key]) {
                bimProperties[key] = { uuid: node.id, name: node.name };
                const expressID = node.userData?.expressID;

                if (expressID !== undefined && ifcApiByModel.has(originalUuid)) {
                    try {
                        const { ifcApi, modelID } = ifcApiByModel.get(originalUuid)!;
                        const entity = ifcApi.GetLine(modelID, Number(expressID));
                        if (entity) {
                            bimProperties[key].ifcType = entity.is_a || "";
                            bimProperties[key].globalId = entity.GlobalId?.value || "";
                            bimProperties[key].ifcName = entity.Name?.value || "";
                        }
                    } catch {}
                }

                if (expressID !== undefined && ifcManagerByModel.has(originalUuid)) {
                    try {
                        const { ifcManager, modelID } = ifcManagerByModel.get(originalUuid)!;
                        const fullProps = await ifcManager.getItemProperties(modelID, Number(expressID));
                        const rawGroups = fullProps?.rawGroups || fullProps?.groups || null;
                        const normalizedGroups = fullProps?.normalizedGroups || null;
                        if (rawGroups && Object.keys(rawGroups).length > 0) {
                            bimProperties[key].ifcRawGroups = rawGroups;
                        }
                        if (normalizedGroups && Object.keys(normalizedGroups).length > 0) {
                            bimProperties[key].ifcNormalizedGroups = normalizedGroups;
                        }
                    } catch {}
                }
            }
        }

        if (node.children && node.children.length > 0) {
            for (let index = node.children.length - 1; index >= 0; index--) {
                stack.push(node.children[index]);
            }
        }
    }

    return bimProperties;
}

function decodeChunkBinaryV8(buffer: ArrayBuffer, bimIdTable: string[]) {
    const dataView = new DataView(buffer);
    let offset = 0;
    const geometryCount = dataView.getUint32(offset, true);
    offset += 4;

    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < geometryCount; i++) {
        const vertexCount = dataView.getUint32(offset, true);
        offset += 4;
        const indexCount = dataView.getUint32(offset, true);
        offset += 4;

        const positions = new Float32Array(buffer, offset, vertexCount * 3);
        offset += vertexCount * 12;
        const normals = new Float32Array(buffer, offset, vertexCount * 3);
        offset += vertexCount * 12;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));

        if (indexCount > 0) {
            const indices = new Uint32Array(buffer, offset, indexCount);
            offset += indexCount * 4;
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        }

        geometries.push(geometry);
    }

    const instanceCount = dataView.getUint32(offset, true);
    offset += 4;

    const matrix = new THREE.Matrix4();
    const instances: Array<{
        bimId: string;
        typeIndex: number;
        color: number;
        matrix: THREE.Matrix4;
        geometry: THREE.BufferGeometry;
    }> = [];

    for (let i = 0; i < instanceCount; i++) {
        const bimIdIndex = dataView.getUint32(offset, true);
        offset += 4;
        const typeIndex = dataView.getUint32(offset, true);
        offset += 4;
        const color = dataView.getUint32(offset, true);
        offset += 4;

        for (let elementIndex = 0; elementIndex < 16; elementIndex++) {
            matrix.elements[elementIndex] = dataView.getFloat32(offset, true);
            offset += 4;
        }

        const geometryIndex = dataView.getUint32(offset, true);
        offset += 4;

        instances.push({
            bimId: bimIdTable[bimIdIndex] ?? String(bimIdIndex),
            typeIndex,
            color,
            matrix: matrix.clone(),
            geometry: geometries[geometryIndex]
        });
    }

    return instances;
}

export async function prepareNbimExportChunks(options: {
    chunks: any[];
    nbimFiles: Map<string, File>;
    nbimMeta: Map<string, { version: number; bimIdTable?: string[] }>;
    bimIdToIndex: Map<string, number>;
    hasValidChunkBinaryRange: (chunk: any) => boolean;
    generateChunkBinaryV8: (items: any[], bimIdToIndex: Map<string, number>) => ArrayBuffer;
}) {
    const {
        chunks,
        nbimFiles,
        nbimMeta,
        bimIdToIndex,
        hasValidChunkBinaryRange,
        generateChunkBinaryV8
    } = options;

    const chunkBlobs: Uint8Array[] = [];
    const exportChunks = chunks.map((chunk) => ({
        id: chunk.id,
        bounds: {
            min: { x: chunk.bounds.min.x, y: chunk.bounds.min.y, z: chunk.bounds.min.z },
            max: { x: chunk.bounds.max.x, y: chunk.bounds.max.y, z: chunk.bounds.max.z }
        },
        originalUuid: chunk.originalUuid ? String(chunk.originalUuid) : undefined,
        byteOffset: 0,
        byteLength: 0
    }));

    let currentOffset = 1024;

    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const exportChunk = exportChunks[index];

        let buffer: ArrayBuffer | null = null;
        if (chunk.node) {
            buffer = generateChunkBinaryV8(chunk.node.items, bimIdToIndex);
        } else if (chunk.nbimFileId && nbimFiles.has(chunk.nbimFileId) && hasValidChunkBinaryRange(chunk)) {
            const file = nbimFiles.get(chunk.nbimFileId)!;
            const raw = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
            const meta = nbimMeta.get(chunk.nbimFileId);
            const version = meta?.version ?? 8;
            if (version !== 8) {
                throw new Error(`Unsupported NBIM version: ${version}. Only V8 is supported.`);
            }

            const instances = decodeChunkBinaryV8(raw, meta?.bimIdTable || []);
            const items = instances.map((instance) => ({
                uuid: "",
                bimId: instance.bimId,
                typeIndex: instance.typeIndex,
                color: instance.color,
                matrix: instance.matrix,
                geometry: instance.geometry
            }));
            buffer = generateChunkBinaryV8(items, bimIdToIndex);
        }

        if (!buffer) {
            continue;
        }

        const uint8 = new Uint8Array(buffer);
        chunkBlobs.push(uint8);
        exportChunk.byteOffset = currentOffset;
        exportChunk.byteLength = uint8.byteLength;
        currentOffset += uint8.byteLength;
    }

    return {
        chunkBlobs,
        exportChunks,
        currentOffset
    };
}

