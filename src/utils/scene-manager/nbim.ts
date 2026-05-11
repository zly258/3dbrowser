import * as THREE from "three";
import { sanitizeFileStem, stripFileExtension } from "../../viewer/exportNaming";
import type { StructureTreeNode } from "./types";
import type { NbimPropertyDocument, NbimPropertyNameIndexItem, NbimPropertyRow } from "../scene-core/nbimIO";

const INVALID_DISPLAY_LABELS = new Set(["", "n/a", "na", "undefined", "null", "-", "--"]);

export function sanitizeDisplayLabel(...candidates: Array<string | null | undefined | number>) {
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) continue;
        const trimmed = String(candidate).trim();
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
    bimPropertyDocs?: Record<string, NbimPropertyDocument>;
    propertyNameIndex?: NbimPropertyNameIndexItem[];
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
            bimPropertyDocs: manifest.bimPropertyDocs || {},
            propertyNameIndex: manifest.propertyNameIndex || []
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

function toSearchablePropertyText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
        return value
            .map((item) => toSearchablePropertyText(item))
            .filter(Boolean)
            .join(", ");
    }
    return "";
}

function appendPropertyRow(
    rows: NbimPropertyRow[],
    group: string,
    key: string,
    value: unknown,
    source?: string,
    rawKey?: string
) {
    const text = toSearchablePropertyText(value);
    const safeGroup = String(group || "").trim();
    const safeKey = String(key || "").trim();
    if (!safeGroup || !safeKey || !text) return;

    rows.push({
        group: safeGroup,
        key: safeKey,
        rawKey,
        path: `${safeGroup}.${safeKey}`,
        value: text,
        source
    });
}

function flattenRecordToRows(
    rows: NbimPropertyRow[],
    group: string,
    record: any,
    source: string,
    prefix = ""
) {
    if (!record || typeof record !== "object") return;

    if (Array.isArray(record)) {
        record.forEach((item, index) => {
            if (item && typeof item === "object" && "key" in item) {
                appendPropertyRow(
                    rows,
                    group,
                    String(item.key || ""),
                    item.value,
                    item.source || source,
                    item.rawKey
                );
                return;
            }

            if (item && typeof item === "object") {
                flattenRecordToRows(rows, group, item, source, `${prefix || "Item"}${index + 1}`);
                return;
            }

            appendPropertyRow(rows, group, `${prefix || "Item"}${index + 1}`, item, source);
        });
        return;
    }

    Object.entries(record).forEach(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            flattenRecordToRows(rows, group, value, source, nextKey);
        } else {
            appendPropertyRow(rows, group, nextKey, value, source, key);
        }
    });
}

export function buildPropertyNameIndex(docs: Record<string, NbimPropertyDocument>): NbimPropertyNameIndexItem[] {
    const map = new Map<string, NbimPropertyNameIndexItem>();

    Object.values(docs || {}).forEach((doc) => {
        (doc.rows || []).forEach((row) => {
            if (!row?.group || !row?.key) return;
            const path = row.path || `${row.group}.${row.key}`;
            if (!map.has(path)) {
                map.set(path, {
                    group: row.group,
                    key: row.key,
                    path,
                    rawKey: row.rawKey,
                    count: 0
                });
            }
            map.get(path)!.count++;
        });
    });

    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));
}

function collectBasicRowsFromNode(node: StructureTreeNode, originalUuid: string): NbimPropertyRow[] {
    const rows: NbimPropertyRow[] = [];
    appendPropertyRow(rows, "基本信息", "UUID", node.id, "nbim");
    appendPropertyRow(rows, "基本信息", "名称", node.name, "nbim");
    appendPropertyRow(rows, "基本信息", "类型", node.type, "nbim");
    appendPropertyRow(rows, "基本信息", "模型ID", originalUuid, "nbim");
    appendPropertyRow(rows, "基本信息", "BIM_ID", node.bimId, "nbim");
    appendPropertyRow(rows, "基本信息", "ExpressID", node.userData?.expressID, "nbim");
    return rows;
}

async function appendIfcRowsForExpressId(options: {
    rows: NbimPropertyRow[];
    oldCompat: any;
    originalUuid: string;
    expressID: unknown;
    ifcApiByModel: Map<string, IfcApiRef>;
    ifcManagerByModel: Map<string, IfcManagerRef>;
}) {
    const { rows, oldCompat, originalUuid, expressID, ifcApiByModel, ifcManagerByModel } = options;
    if (expressID === undefined || expressID === null || expressID === "") return;
    const id = Number(expressID);
    if (!Number.isFinite(id)) return;

    if (ifcApiByModel.has(originalUuid)) {
        try {
            const { ifcApi, modelID } = ifcApiByModel.get(originalUuid)!;
            const entity = ifcApi.GetLine(modelID, id);
            if (entity) {
                const ifcType = entity.is_a || "";
                const globalId = entity.GlobalId?.value || "";
                const ifcName = entity.Name?.value || "";
                oldCompat.ifcType = ifcType;
                oldCompat.globalId = globalId;
                oldCompat.ifcName = ifcName;
                appendPropertyRow(rows, "IFC 标识", "类型", ifcType, "ifc", "is_a");
                appendPropertyRow(rows, "IFC 标识", "GlobalId", globalId, "ifc", "GlobalId");
                appendPropertyRow(rows, "IFC 标识", "名称", ifcName, "ifc", "Name");
            }
        } catch {}
    }

    if (ifcManagerByModel.has(originalUuid)) {
        try {
            const { ifcManager, modelID } = ifcManagerByModel.get(originalUuid)!;
            const fullProps = await ifcManager.getItemProperties(modelID, id);
            const rawGroups = fullProps?.rawGroups || fullProps?.groups || null;
            const normalizedGroups = fullProps?.normalizedGroups || null;

            if (rawGroups && Object.keys(rawGroups).length > 0) oldCompat.ifcRawGroups = rawGroups;
            if (normalizedGroups && Object.keys(normalizedGroups).length > 0) oldCompat.ifcNormalizedGroups = normalizedGroups;

            if (normalizedGroups && Object.keys(normalizedGroups).length > 0) {
                Object.entries(normalizedGroups).forEach(([groupName, groupValue]) => {
                    flattenRecordToRows(rows, groupName, groupValue, "ifc-normalized");
                });
            } else if (rawGroups && Object.keys(rawGroups).length > 0) {
                Object.entries(rawGroups).forEach(([groupName, groupValue]) => {
                    flattenRecordToRows(rows, groupName, groupValue, "ifc-raw");
                });
            }
        } catch {}
    }
}

export async function collectNbimBimProperties(options: {
    structureRoot: StructureTreeNode;
    ifcApiByModel: Map<string, IfcApiRef>;
    ifcManagerByModel: Map<string, IfcManagerRef>;
}) {
    const { structureRoot, ifcApiByModel, ifcManagerByModel } = options;
    const bimProperties: Record<string, any> = {};
    const bimPropertyDocs: Record<string, NbimPropertyDocument> = {};
    const stack: StructureTreeNode[] = [structureRoot];

    while (stack.length > 0) {
        const node = stack.pop()!;
        const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";

        if (node.bimId) {
            const key = `${originalUuid}::${node.bimId}`;
            if (!bimPropertyDocs[key]) {
                const rows = collectBasicRowsFromNode(node, originalUuid);
                const oldCompat: any = { uuid: node.id, name: node.name };
                await appendIfcRowsForExpressId({
                    rows,
                    oldCompat,
                    originalUuid,
                    expressID: node.userData?.expressID,
                    ifcApiByModel,
                    ifcManagerByModel
                });

                bimProperties[key] = oldCompat;
                bimPropertyDocs[key] = {
                    owner: originalUuid,
                    bimId: String(node.bimId),
                    uuid: String(node.id),
                    name: String(node.name || ""),
                    rows
                };
            }
        }

        if (node.children && node.children.length > 0) {
            for (let index = node.children.length - 1; index >= 0; index--) {
                stack.push(node.children[index]);
            }
        }
    }

    return {
        bimProperties,
        bimPropertyDocs,
        propertyNameIndex: buildPropertyNameIndex(bimPropertyDocs)
    };
}


export function collectIfcObjectBasicPropertyIndex(object: THREE.Object3D) {
    const owner = String(object.uuid);
    const bimPropertyDocs: Record<string, NbimPropertyDocument> = {};
    const seen = new Set<string>();

    object.traverse((child) => {
        const expressID = child.userData?.expressID;
        if (expressID === undefined || expressID === null || expressID === "") return;
        const key = `${owner}::${expressID}`;
        if (seen.has(key)) return;
        seen.add(key);

        const rows: NbimPropertyRow[] = [];
        appendPropertyRow(rows, "基本信息", "UUID", child.uuid, "ifc-basic");
        appendPropertyRow(rows, "基本信息", "名称", child.name, "ifc-basic");
        appendPropertyRow(rows, "基本信息", "类型", child.type, "ifc-basic");
        appendPropertyRow(rows, "基本信息", "模型ID", owner, "ifc-basic");
        appendPropertyRow(rows, "基本信息", "BIM_ID", expressID, "ifc-basic");
        appendPropertyRow(rows, "基本信息", "ExpressID", expressID, "ifc-basic");
        const ifcType = child.userData?.ifcType || child.userData?.ifcMetadata?.typeName || child.userData?.ifcMetadata?.category;
        appendPropertyRow(rows, "IFC 标识", "类型", ifcType, "ifc-basic");

        bimPropertyDocs[key] = {
            owner,
            bimId: String(expressID),
            uuid: child.uuid,
            name: String(child.name || expressID),
            rows
        };
    });

    return {
        bimPropertyDocs,
        propertyNameIndex: buildPropertyNameIndex(bimPropertyDocs)
    };
}

export async function collectIfcObjectPropertyIndex(options: {
    object: THREE.Object3D;
    ifcApiByModel: Map<string, IfcApiRef>;
    ifcManagerByModel: Map<string, IfcManagerRef>;
    onProgress?: (processed: number, total: number) => void;
}) {
    const { object, ifcApiByModel, ifcManagerByModel, onProgress } = options;
    const bimProperties: Record<string, any> = {};
    const bimPropertyDocs: Record<string, NbimPropertyDocument> = {};
    const owner = String(object.uuid);
    const meshes: THREE.Object3D[] = [];
    const seen = new Set<string>();

    object.traverse((child) => {
        const expressID = child.userData?.expressID;
        if (expressID === undefined || expressID === null || expressID === "") return;
        const key = `${owner}::${expressID}`;
        if (seen.has(key)) return;
        seen.add(key);
        meshes.push(child);
    });

    for (let index = 0; index < meshes.length; index++) {
        const child = meshes[index];
        const expressID = child.userData?.expressID;
        const key = `${owner}::${expressID}`;
        const rows: NbimPropertyRow[] = [];
        const oldCompat: any = { uuid: child.uuid, name: child.name };

        appendPropertyRow(rows, "基本信息", "UUID", child.uuid, "ifc-object");
        appendPropertyRow(rows, "基本信息", "名称", child.name, "ifc-object");
        appendPropertyRow(rows, "基本信息", "类型", child.type, "ifc-object");
        appendPropertyRow(rows, "基本信息", "模型ID", owner, "ifc-object");
        appendPropertyRow(rows, "基本信息", "BIM_ID", expressID, "ifc-object");
        appendPropertyRow(rows, "基本信息", "ExpressID", expressID, "ifc-object");

        const ifcMeta = child.userData?.ifcMetadata;
        if (ifcMeta && typeof ifcMeta === "object") {
            flattenRecordToRows(rows, "IFC 元数据", ifcMeta, "ifc-metadata");
        }

        await appendIfcRowsForExpressId({
            rows,
            oldCompat,
            originalUuid: owner,
            expressID,
            ifcApiByModel,
            ifcManagerByModel
        });

        bimProperties[key] = oldCompat;
        bimPropertyDocs[key] = {
            owner,
            bimId: String(expressID),
            uuid: child.uuid,
            name: child.name || String(expressID),
            rows
        };

        if (index > 0 && index % 120 === 0) {
            onProgress?.(index, meshes.length);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
    }

    onProgress?.(meshes.length, meshes.length);

    return {
        bimProperties,
        bimPropertyDocs,
        propertyNameIndex: buildPropertyNameIndex(bimPropertyDocs)
    };
}

export function convertLegacyBimPropertiesToDocs(
    bimProperties: Record<string, any>
) {
    const bimPropertyDocs: Record<string, NbimPropertyDocument> = {};

    Object.entries(bimProperties || {}).forEach(([key, value]: [string, any]) => {
        const separatorIndex = key.indexOf("::");
        const owner = separatorIndex > 0 ? key.slice(0, separatorIndex) : "";
        const bimId = separatorIndex > 0 ? key.slice(separatorIndex + 2) : key;
        const rows: NbimPropertyRow[] = [];

        appendPropertyRow(rows, "基本信息", "UUID", value?.uuid || bimId, "legacy-nbim");
        appendPropertyRow(rows, "基本信息", "名称", value?.name || "", "legacy-nbim");
        appendPropertyRow(rows, "基本信息", "BIM_ID", bimId, "legacy-nbim");
        flattenRecordToRows(rows, "NBIM", value, "legacy-nbim");

        if (value?.ifcNormalizedGroups) {
            Object.entries(value.ifcNormalizedGroups).forEach(([groupName, groupValue]) => {
                flattenRecordToRows(rows, groupName, groupValue, "legacy-ifc");
            });
        } else if (value?.ifcRawGroups) {
            Object.entries(value.ifcRawGroups).forEach(([groupName, groupValue]) => {
                flattenRecordToRows(rows, groupName, groupValue, "legacy-ifc");
            });
        }

        bimPropertyDocs[key] = {
            owner,
            bimId,
            uuid: value?.uuid || bimId,
            name: value?.name || "",
            rows
        };
    });

    return {
        bimPropertyDocs,
        propertyNameIndex: buildPropertyNameIndex(bimPropertyDocs)
    };
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

