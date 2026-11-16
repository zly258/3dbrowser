/**
 * 体积诊断：统计 v11 文件里几何/实例/法线的构成，并估算
 *   1) 跨分块几何全局去重能省多少
 *   2) 丢弃法线（解码时重算）能省多少
 */
import fs from "node:fs";
import path from "node:path";
import { readChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";

function fnv1a(bytes: Uint8Array, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

function quantizeGeometry(geometry: any) {
    const position: Float32Array = geometry.position;
    const normal: Int8Array = geometry.normal;
    const index: Uint32Array | null = geometry.index;
    const vertCount = position.length / 3;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertCount; i++) {
        const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0; }
    const sx = maxX - minX > 0 ? (maxX - minX) / 65535 : 0;
    const sy = maxY - minY > 0 ? (maxY - minY) / 65535 : 0;
    const sz = maxZ - minZ > 0 ? (maxZ - minZ) / 65535 : 0;
    const q = new Uint16Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
        q[i * 3] = sx > 0 ? Math.round((position[i * 3] - minX) / sx) : 0;
        q[i * 3 + 1] = sy > 0 ? Math.round((position[i * 3 + 1] - minY) / sy) : 0;
        q[i * 3 + 2] = sz > 0 ? Math.round((position[i * 3 + 2] - minZ) / sz) : 0;
    }
    return { q: new Uint8Array(q.buffer, q.byteOffset, q.byteLength), normal, index, vertCount, indexCount: index ? index.length : 0 };
}

async function analyze(file: string) {
    const buf = fs.readFileSync(file);
    const blob = new Blob([buf]);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12), po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const zlib = await import("node:zlib");
    const manifest = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));

    const seen = new Map<number, { bytes: number; count: number }>();
    let sumGeoBytes = 0;
    let sumNormalBytes = 0;
    let sumIndexBytes = 0;
    let sumInstanceBytes = 0;
    let totalGeos = 0;
    let totalVerts = 0;
    let totalPerChunkHashCost = 0;

    for (const chunk of manifest.chunks) {
        const chunkBuf = blob.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
        const decoded = await readChunkV11(await chunkBuf.arrayBuffer());
        sumInstanceBytes += decoded.instances.length * 80;
        for (const g of decoded.geometries) {
            totalGeos++;
            const vertCount = g.position.length / 3;
            totalVerts += vertCount;
            const indexCount = g.index ? g.index.length : 0;
            const normalBytes = vertCount * 3;
            const indexBytes = Math.min(indexCount * 2, vertCount <= 65536 ? indexCount * 2 : indexCount * 4);
            const posBytes = vertCount * 6;
            const header = 36;
            sumNormalBytes += normalBytes;
            sumIndexBytes += indexBytes;
            sumGeoBytes += header + posBytes + normalBytes + indexBytes;
            totalPerChunkHashCost += header + posBytes;

            const quant = quantizeGeometry(g);
            let h = fnv1a(quant.q);
            h = fnv1a(new Uint8Array(quant.normal.buffer, quant.normal.byteOffset, quant.normal.byteLength), h);
            if (quant.index) h = fnv1a(new Uint8Array(quant.index.buffer, quant.index.byteOffset, quant.index.byteLength), h);
            const key = h ^ (vertCount * 0x9e3779b1) ^ (indexCount * 0x85ebca6b);
            const entry = seen.get(key);
            const gBytes = header + posBytes + normalBytes + indexBytes;
            if (entry) { entry.count++; } else { seen.set(key, { bytes: gBytes, count: 1 }); }
        }
    }

    const uniqueGeoBytes = [...seen.values()].reduce((s, e) => s + e.bytes, 0);
    const dupGeos = totalGeos - seen.size;
    const chunkSection = po - 1024;

    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`文件 ${buf.length} B：分块 ${chunkSection} B，属性 ${pl} B，manifest ${ml} B`);
    console.log(`分块 ${manifest.chunks.length}，几何 ${totalGeos}（全局唯一 ${seen.size}，重复 ${dupGeos}），顶点 ${totalVerts}`);
    console.log(`几何未压缩估算：位置 ${(totalVerts * 6 / 1024).toFixed(1)} KB，法线 ${(sumNormalBytes / 1024).toFixed(1)} KB，索引 ${(sumIndexBytes / 1024).toFixed(1)} KB，实例 ${(sumInstanceBytes / 1024).toFixed(1)} KB`);
    console.log(`按分块存几何合计 ${(sumGeoBytes / 1024).toFixed(1)} KB → 全局唯一 ${(uniqueGeoBytes / 1024).toFixed(1)} KB（去重省 ${(100 * (1 - uniqueGeoBytes / sumGeoBytes)).toFixed(1)}%）`);
    console.log(`丢弃法线可省 ${(sumNormalBytes / 1024).toFixed(1)} KB（占几何 ${(100 * sumNormalBytes / sumGeoBytes).toFixed(1)}%）`);
    return { uniqueGeoBytes, sumGeoBytes, dupGeos, totalGeos };
}

async function main() {
    const files = [
        "<models>",
        "<models>",
        "<models>"
    ].filter((f) => fs.existsSync(f));
    for (const f of files) await analyze(f);
}

main().catch((e) => { console.error(e); process.exit(1); });