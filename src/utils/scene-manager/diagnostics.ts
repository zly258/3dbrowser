import * as THREE from "three";
import { getBatchedGeometryId, getBatchedGeometryViewStats } from "./batchedGeometryView";

/**
 * SceneManager 只读诊断计算。
 *
 * 这些函数不修改任何状态，只把内部数据汇总成报表；单独成模块后
 * SceneManager 不再承接报表拼装逻辑，也让“内存分类”逻辑便于测试。
 */

export interface MemoryReportInput {
    chunks: any[];
    getChunkCostMB: (chunk: any) => number;
    chunkLoadedCount: number;
    processingChunkCount: number;
    chunkResidentBudgetMB: number;
    maxLoadedChunks: number;
    chunkMeshCacheSize: number;
    propertyRows: number;
    nbimAllSearchDocsLength: number;
    nbimSearchDocsByUuidSize: number;
    nbimSearchDocsByBimIdSize: number;
    nbimPropertyNameIndexSize: number;
    structureRoot: any;
    nodeMapSize: number;
    bimIdToNodeIdsSize: number;
    chunkReadCacheBytes: number;
    chunkReadCacheSize: number;
    chunkReadCacheBudgetMB: number;
    edgeStats: { count: number; bytes: number };
    renderer: THREE.WebGLRenderer;
}

export function buildMemoryReport(input: MemoryReportInput) {
    const perf = (performance as any)?.memory;
    const bytesOf = (geometry?: THREE.BufferGeometry | null) => {
        if (!geometry) return 0;
        let total = 0;
        const attributes = geometry.attributes || {};
        for (const name in attributes) {
            const array = (attributes as any)[name]?.array;
            if (array?.byteLength) total += array.byteLength;
        }
        const index = (geometry as any).index;
        if (index?.array?.byteLength) total += index.array.byteLength;
        return total;
    };

    let batchedBytes = 0;
    let sourceBytes = 0;
    let instanceCount = 0;
    let batchedMeshCount = 0;
    let sourceGeometryCount = 0;
    let estimatedResidentMB = 0;

    for (const chunk of input.chunks) {
        if (chunk?.loaded) estimatedResidentMB += input.getChunkCostMB(chunk);
        const mesh = chunk?.mesh as THREE.BatchedMesh | undefined;
        if (!mesh) continue;
        batchedMeshCount++;
        batchedBytes += bytesOf(mesh.geometry);
        instanceCount += Number((mesh as any).instanceCount) || 0;
        // 逐实例几何视图现在按需创建，只统计真正存在的视图（position/normal 共享合并缓冲，
        // 仅索引副本占额外内存）。
        const viewStats = getBatchedGeometryViewStats(mesh);
        sourceGeometryCount += viewStats.count;
        sourceBytes += viewStats.bytes;
    }

    let structureNodes = 0;
    if (input.structureRoot) {
        const stack: any[] = [input.structureRoot];
        while (stack.length > 0) {
            const node = stack.pop();
            structureNodes++;
            if (Array.isArray(node?.children)) stack.push(...node.children);
        }
    }

    const toMB = (bytes: number) => Number((bytes / 1048576).toFixed(2));
    return {
        heap: {
            usedMB: perf ? Number((perf.usedJSHeapSize / 1048576).toFixed(1)) : null,
            limitMB: perf ? Number((perf.jsHeapSizeLimit / 1048576).toFixed(0)) : null
        },
        chunks: {
            total: input.chunks.length,
            loaded: input.chunkLoadedCount,
            processing: input.processingChunkCount,
            residentBudgetMB: Number(input.chunkResidentBudgetMB.toFixed(1)),
            estimatedResidentMB: Number(estimatedResidentMB.toFixed(1)),
            maxLoadedChunks: input.maxLoadedChunks,
            cachedMeshes: input.chunkMeshCacheSize,
            coarseLod: input.chunks.reduce((sum, chunk) => sum + (chunk?.lodLevel === 1 ? 1 : 0), 0)
        },
        geometry: {
            batchedMeshCount,
            batchedBytesMB: toMB(batchedBytes),
            sourceGeometryCount,
            sourceBytesMB: toMB(sourceBytes),
            instanceCount,
            instanceMetaMB: Number(((instanceCount * 88) / 1048576).toFixed(1))
        },
        edges: { objects: input.edgeStats.count, bytesMB: toMB(input.edgeStats.bytes) },
        properties: {
            pendingDocs: 0,
            indexedDocs: input.nbimAllSearchDocsLength,
            searchDocsByUuid: input.nbimSearchDocsByUuidSize,
            searchDocsByBimId: input.nbimSearchDocsByBimIdSize,
            propertyNameIndex: input.nbimPropertyNameIndexSize,
            rows: input.propertyRows
        },
        structure: {
            nodes: structureNodes,
            nodeMap: input.nodeMapSize,
            bimIdToNodeIds: input.bimIdToNodeIdsSize
        },
        caches: {
            readCacheEntries: input.chunkReadCacheSize,
            readCacheMB: toMB(input.chunkReadCacheBytes),
            readCacheBudgetMB: input.chunkReadCacheBudgetMB
        },
        render: {
            drawCalls: input.renderer.info.render.calls,
            triangles: input.renderer.info.render.triangles
        }
    };
}

/** 按阈值统计实例尺寸分布（研究 LOD 收益用）。 */
export function buildInstanceSizeStats(
    chunks: any[],
    thresholds: number[] = [0.02, 0.05, 0.1, 0.2, 0.5, 1]
) {
    const meshes: THREE.BatchedMesh[] = [];
    for (const chunk of chunks) {
        if (chunk?.mesh) meshes.push(chunk.mesh as THREE.BatchedMesh);
    }
    let totalVerts = 0;
    let totalInstances = 0;
    const instanceSizes: number[] = [];
    const geos: Array<{ diag: number; verts: number; maxWorldDiag: number }> = [];
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const matrix = new THREE.Matrix4();

    for (const mesh of meshes) {
        const count = Number((mesh as any).instanceCount) || 0;
        const geoMap = new Map<number, { diag: number; verts: number; maxWorldDiag: number }>();
        for (let i = 0; i < count; i++) {
            const gid = getBatchedGeometryId(mesh, i);
            if (gid === null) continue;
            let geo = geoMap.get(gid);
            if (!geo) {
                const geometryBox = (mesh as any).getBoundingBoxAt?.(gid, box);
                const range = (mesh as any).getGeometryRangeAt?.(gid, {});
                const diag = geometryBox ? geometryBox.getSize(size).length() : 0;
                geo = { diag, verts: Number(range?.vertexCount) || 0, maxWorldDiag: 0 };
                geoMap.set(gid, geo);
                geos.push(geo);
                totalVerts += geo.verts;
            }
            mesh.getMatrixAt(i, matrix);
            const e = matrix.elements;
            const scale = (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10])) / 3;
            const worldDiag = geo.diag * scale;
            if (worldDiag > geo.maxWorldDiag) geo.maxWorldDiag = worldDiag;
            instanceSizes.push(worldDiag);
            totalInstances++;
        }
    }

    const sorted = instanceSizes.slice().sort((a, b) => a - b);
    const percentile = (p: number) => sorted.length
        ? Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(3))
        : 0;
    const distribution = thresholds.map((threshold) => {
        const keptInstances = sorted.filter((value) => value >= threshold).length;
        let keptVerts = 0;
        for (const geo of geos) {
            if (geo.maxWorldDiag >= threshold) keptVerts += geo.verts;
        }
        return {
            threshold,
            instanceKeepPercent: totalInstances ? Number((keptInstances / totalInstances * 100).toFixed(1)) : 0,
            vertexKeepPercent: totalVerts ? Number((keptVerts / totalVerts * 100).toFixed(1)) : 0
        };
    });

    return {
        meshes: meshes.length,
        totalInstances,
        totalVerts,
        percentiles: { p10: percentile(0.1), p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75), p90: percentile(0.9) },
        distribution
    };
}
