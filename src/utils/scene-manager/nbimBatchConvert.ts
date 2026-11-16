import * as THREE from "three";
import { buildOctree, calculateGeometryMemory, collectItems, collectItemsBatched, collectLeafNodes } from "../octree";
import { sanitizeFileStem, stripFileExtension } from "../../viewer/exportNaming";
import type { StructureTreeNode } from "./types";
import {
    buildExportStructureTree,
    collectIfcModelReferences,
    collectNbimBimProperties,
    sanitizeDisplayLabel
} from "./nbim";
import { encodeNbip } from "../scene-core/nbip";
import { buildNbim11File, NBIM11_VERSION } from "../scene-core/nbimIO";
import { buildChunkPayloadV11, frameChunkV11 } from "./nbimExportChunks";
import { compressInBlocks } from "../scene-core/nbimBlock";
import { compressBytes, resolveExportCodec } from "../scene-core/codec";

interface BatchConvertOptions {
    objects: THREE.Object3D[];
    fileNames: string[];
    onProgress?: (progress: number, message: string) => void;
}

interface BatchChunk {
    id: string;
    bounds: THREE.Box3;
    originalUuid: string;
    items: any[];
}

function createModelStructureNode(object: THREE.Object3D, modelUuid: string): StructureTreeNode {
    const isMesh = Boolean((object as any).isMesh);
    const expressID = object.userData?.expressID;
    const rawBimId = object.userData?.bimId;
    const bimId = rawBimId !== undefined && rawBimId !== null && rawBimId !== ""
        ? String(rawBimId)
        : expressID !== undefined && expressID !== null
            ? String(expressID)
            : object.name
                ? String(object.name)
                : undefined;

    const node: StructureTreeNode = {
        id: object.uuid,
        name: sanitizeDisplayLabel(object.name, object.userData?.name) || (isMesh ? `Mesh_${object.id}` : `Group_${object.id}`),
        type: isMesh ? "Mesh" : "Group",
        visible: object.visible !== false,
        children: [],
        bimId,
        userData: { originalUuid: modelUuid }
    };
    if (expressID !== undefined && expressID !== null) node.userData!.expressID = expressID as any;
    if (object.userData?.modelID !== undefined) node.userData!.modelID = object.userData.modelID;

    for (const child of object.children) {
        node.children!.push(createModelStructureNode(child, modelUuid));
    }
    return node;
}

function computeItemsBounds(items: any[]) {
    const bounds = new THREE.Box3();
    const temp = new THREE.Box3();
    for (const item of items) {
        if (!item.geometry) continue;
        if (!item.geometry.boundingBox) item.geometry.computeBoundingBox();
        if (!item.geometry.boundingBox) continue;
        temp.copy(item.geometry.boundingBox).applyMatrix4(item.matrix);
        bounds.union(temp);
    }
    return bounds.isEmpty() ? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()) : bounds;
}

function applyGlobalOffset(objects: THREE.Object3D[]) {
    const firstBox = new THREE.Box3().setFromObject(objects[0]);
    if (firstBox.isEmpty()) return new THREE.Vector3();
    const offset = firstBox.getCenter(new THREE.Vector3());
    for (const object of objects) {
        object.position.sub(offset);
        object.updateMatrixWorld(true);
    }
    return offset;
}

/**
 * 把一个或多个已解析的 Object3D 直接构建为 NBIM Blob。
 * 不加入场景、不创建 WebGL 资源、不依赖当前视口，因此批量转换可以不“打开模型”。
 */
export async function buildNbimBlobFromObjects(options: BatchConvertOptions) {
    const { objects, fileNames, onProgress } = options;
    if (!objects.length) throw new Error("没有可转换的模型");

    applyGlobalOffset(objects);

    const modelRoots: StructureTreeNode[] = [];
    const chunks: BatchChunk[] = [];
    const nodeByUuid = new Map<string, StructureTreeNode>();
    const meshUuidToChunkId = new Map<string, string>();
    const modelBounds = new THREE.Box3();
    let totalMeshes = 0;
    let totalFaces = 0;
    let totalMemory = 0;

    const registerNode = (node: StructureTreeNode) => {
        nodeByUuid.set(node.id, node);
        node.children?.forEach(registerNode);
    };

    for (let modelIndex = 0; modelIndex < objects.length; modelIndex++) {
        const object = objects[modelIndex];
        const fileName = fileNames[modelIndex] || object.name || `model_${modelIndex + 1}`;
        object.userData.originalUuid = object.uuid;
        onProgress?.(Math.round((modelIndex / Math.max(1, objects.length)) * 35), `正在收集构件 ${fileName}...`);

        const meshCount = (() => {
            let count = 0;
            object.traverse((child) => { if ((child as THREE.Mesh).isMesh) count++; });
            return count;
        })();

        const items = meshCount >= 1200
            ? await collectItemsBatched(object, {
                batchSize: 5200,
                onProgress: (processed, total) => {
                    const ratio = total > 0 ? processed / total : 1;
                    onProgress?.(Math.round((modelIndex / Math.max(1, objects.length) + ratio / Math.max(1, objects.length)) * 35), `正在收集构件 ${fileName}... (${processed}/${total})`);
                }
            })
            : collectItems(object);

        // 统计口径与 SceneManager.collectObjectOverview 一致：按场景 Mesh 对象计数一次，
        // InstancedMesh 的多个实例不重复放大“网格数/面数”（否则大量实例化模型会虚增数倍面数）。
        object.traverse((child: any) => {
            if (!child?.isMesh || !child.geometry) return;
            totalMeshes += 1;
            const geo = child.geometry as THREE.BufferGeometry;
            if (geo.index) totalFaces += geo.index.count / 3;
            else if (geo.attributes?.position) totalFaces += geo.attributes.position.count / 3;
            totalMemory += calculateGeometryMemory(geo);
        });

        const modelStructure = createModelStructureNode(object, object.uuid);
        registerNode(modelStructure);
        modelRoots.push(modelStructure);

        if (items.length > 0) {
            const bounds = computeItemsBounds(items);
            modelBounds.union(bounds);
            const octree = buildOctree(items, bounds.clone(), { maxItemsPerNode: 3000, maxDepth: 6 });
            const leaves = collectLeafNodes(octree);

            leaves.forEach((leaf, chunkIndex) => {
                if (!leaf.items.length) return;
                const chunkId = `${object.uuid}_chunk_${chunkIndex}`;
                chunks.push({
                    id: chunkId,
                    bounds: leaf.bounds.clone(),
                    originalUuid: object.uuid,
                    items: leaf.items
                });
                for (const item of leaf.items) {
                    if (item?.uuid && !meshUuidToChunkId.has(item.uuid)) {
                        meshUuidToChunkId.set(item.uuid, chunkId);
                    }
                }
            });
        }

        onProgress?.(Math.round(((modelIndex + 1) / Math.max(1, objects.length)) * 45), `已处理 ${modelIndex + 1}/${objects.length} 个模型`);
    }

    for (const [uuid, chunkId] of meshUuidToChunkId) {
        const node = nodeByUuid.get(uuid);
        if (node && node.type === "Mesh") node.chunkId = chunkId;
    }

    const structureRoot: StructureTreeNode = {
        id: "root",
        name: "Root",
        type: "Group",
        children: modelRoots
    };

    // bimId 表：与 SceneManager.exportNbim 相同的遍历顺序
    const bimIdTable: string[] = [""];
    const bimIdToIndex = new Map<string, number>();
    const uuidToBimId = new Map<string, string>();
    const addBimId = (bimId?: string) => {
        if (!bimId || bimIdToIndex.has(bimId)) return;
        bimIdToIndex.set(bimId, bimIdTable.length);
        bimIdTable.push(bimId);
    };
    const traverseBimIds = (node: StructureTreeNode) => {
        addBimId(node.bimId);
        if (node.bimId) uuidToBimId.set(node.id, String(node.bimId));
        node.children?.forEach(traverseBimIds);
    };
    traverseBimIds(structureRoot);

    onProgress?.(50, "正在解析属性...");
    const ifcGroup = new THREE.Group();
    for (const object of objects) ifcGroup.add(object);
    const { ifcApiByModel, ifcManagerByModel } = collectIfcModelReferences(ifcGroup);
    const { bimPropertyDocs, propertyNameIndex } = await collectNbimBimProperties({
        structureRoot,
        ifcApiByModel,
        ifcManagerByModel
    });
    for (const object of objects) ifcGroup.remove(object);

    onProgress?.(65, "正在生成几何分块...");
    const exportCodec = await resolveExportCodec();
    const chunkBlobs: Uint8Array[] = [];
    const exportChunks: any[] = [];
    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const payload = buildChunkPayloadV11(chunk.items, bimIdToIndex, (item: any) => {
            return uuidToBimId.get(item.uuid) || item.bimId || item.uuid;
        });
        const framed = await frameChunkV11(payload, exportCodec);
        exportChunks.push({
            id: chunk.id,
            bounds: {
                min: { x: chunk.bounds.min.x, y: chunk.bounds.min.y, z: chunk.bounds.min.z },
                max: { x: chunk.bounds.max.x, y: chunk.bounds.max.y, z: chunk.bounds.max.z }
            },
            originalUuid: chunk.originalUuid,
            byteOffset: 0,
            byteLength: framed.byteLength,
            decodedLength: payload.byteLength,
            encoding: NBIM11_VERSION
        });
        chunkBlobs.push(framed);
        if ((index & 63) === 63) {
            onProgress?.(65 + Math.round(((index + 1) / Math.max(1, chunks.length)) * 20), "正在生成几何分块...");
        }
    }

    const bounds = modelBounds.isEmpty()
        ? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
        : {
            min: { x: modelBounds.min.x, y: modelBounds.min.y, z: modelBounds.min.z },
            max: { x: modelBounds.max.x, y: modelBounds.max.y, z: modelBounds.max.z }
        };

    // 文件主名
    const firstStem = fileNames.length === 1 ? sanitizeFileStem(stripFileExtension(fileNames[0])) : "";
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const defaultStem = `批量导出_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const modelStem = firstStem || defaultStem;

    onProgress?.(86, "正在生成属性数据库...");
    const encodedPropertyDb = encodeNbip(bimPropertyDocs, modelStem);
    const propertySection = await compressInBlocks(
        encodedPropertyDb.bytes,
        undefined,
        exportCodec,
        (block) => compressBytes(block, exportCodec, 9)
    );

    onProgress?.(92, "正在写入 NBIM11...");
    const { file } = await buildNbim11File({
        chunkBlobs,
        chunkEntries: exportChunks,
        propertySection,
        propertyInfo: {
            length: propertySection.byteLength,
            components: encodedPropertyDb.stats.components,
            rows: encodedPropertyDb.stats.rows,
            encoding: "block-gzip"
        },
        manifest: {
            globalBounds: bounds,
            chunks: exportChunks,
            stats: {
                meshes: totalMeshes,
                faces: Math.floor(totalFaces),
                memory: Number(totalMemory.toFixed(2))
            },
            structureTree: buildExportStructureTree(structureRoot),
            bimIdTable
        },
        manifestCodec: exportCodec,
        compressManifest: (bytes) => compressBytes(bytes, exportCodec, 9)
    });

    onProgress?.(100, "转换完成");
    return {
        fileBlob: new Blob([file], { type: "application/octet-stream" }),
        fileName: `${modelStem}.nbim`,
        stats: {
            meshes: totalMeshes,
            faces: Math.floor(totalFaces),
            memory: Number(totalMemory.toFixed(2))
        },
        chunkCount: chunks.length,
        propertyStats: encodedPropertyDb.stats
    };
}

export function downloadNbimBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
