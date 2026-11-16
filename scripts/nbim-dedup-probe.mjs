/**
 * 直接从旧版 v9 源文件统计“全局几何去重”的上限收益（不解码属性，快）。
 * 用法: node scripts/run-nbim-dedup-probe.mjs <a.nbim> <b.nbim> ...
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const LEGACY_MAGIC = 0x4d49424e;
const V9_CHUNK_MAGIC = 0x3956424e;

function fnv1a(bytes, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

/** 只解出每个几何的量化指纹与字节量，不构造 three 对象。 */
function scanV9Chunk(payload, out) {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const scales = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;
    const offsets = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;

    for (let i = 0; i < geoCount; i++) {
        const vertCount = dv.getUint32(o, true); o += 4;
        const indexCount = dv.getUint32(o, true); o += 4;
        const indexType = dv.getUint8(o); o += 1;

        // v9 位置已是 int16 量化：直接对原始片段做指纹
        const posStart = o;
        o += vertCount * 6;
        const nrmStart = o;
        o += vertCount * 3;
        const idxStart = o;
        const idxBytes = indexCount > 0 ? indexCount * (indexType === 1 ? 2 : 4) : 0;
        o += idxBytes;

        const posSlice = payload.subarray(posStart, posStart + vertCount * 6);
        const nrmSlice = payload.subarray(nrmStart, nrmStart + vertCount * 3);
        let h = fnv1a(posSlice);
        h = fnv1a(nrmSlice, h);
        if (idxBytes) h = fnv1a(payload.subarray(idxStart, idxStart + idxBytes), h);
        const key = (h ^ Math.imul(vertCount, 0x9e3779b1) ^ Math.imul(indexCount, 0x85ebca6b)) >>> 0;

        const idxStored = indexCount > 0 ? Math.min(indexCount * 2, vertCount <= 65536 ? indexCount * 2 : indexCount * 4) : 0;
        const bytes = 36 + vertCount * 6 + vertCount * 3 + idxStored;
        out.totalGeos++;
        out.totalVerts += vertCount;
        out.totalIndices += indexCount;
        out.sumPos += vertCount * 6;
        out.sumNrm += vertCount * 3;
        out.sumIdx += idxStored;
        const prev = out.seen.get(key);
        if (prev) {
            prev.count++;
            out.dupBytes += bytes;
            out.dupGeos++;
        } else {
            out.seen.set(key, { bytes, count: 1 });
            out.uniqueBytes += bytes;
        }
    }
    const instanceCount = dv.getUint32(o, true); o += 4;
    out.instances += instanceCount;
    out.sumInst += instanceCount * 80;
}

function probe(file) {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32LE(0) !== LEGACY_MAGIC) { console.log(`跳过（非旧版）: ${path.basename(file)}`); return; }
    const version = buf.readUInt32LE(4);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const manifest = JSON.parse(buf.subarray(mo, mo + ml).toString("utf8"));
    const chunks = manifest.chunks || [];

    const out = {
        totalGeos: 0, dupGeos: 0, totalVerts: 0, totalIndices: 0, instances: 0,
        sumPos: 0, sumNrm: 0, sumIdx: 0, sumInst: 0, dupBytes: 0, uniqueBytes: 0,
        seen: new Map()
    };

    for (const entry of chunks) {
        const raw = buf.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength);
        if (raw.readUInt32LE(0) !== V9_CHUNK_MAGIC) continue;
        const payloadLength = raw.readUInt32LE(8);
        const compressedLength = raw.readUInt32LE(12);
        const payload = zlib.gunzipSync(raw.subarray(16, 16 + compressedLength));
        if (payload.length !== payloadLength) throw new Error("解压长度不符");
        scanV9Chunk(payload, out);
    }

    const sumGeo = out.sumPos + out.sumNrm + out.sumIdx + out.totalGeos * 36;
    const dedupedGeo = sumGeo - out.dupBytes;
    console.log(`\n=== ${path.basename(file)} (v${version}, ${chunks.length} 块) ===`);
    console.log(`源文件 ${(buf.length / 1048576).toFixed(2)} MB，顶点 ${out.totalVerts}，索引 ${out.totalIndices}，实例 ${out.instances}`);
    console.log(`几何原始构成：位置 ${(out.sumPos / 1048576).toFixed(2)} MB，法线 ${(out.sumNrm / 1048576).toFixed(2)} MB，索引 ${(out.sumIdx / 1048576).toFixed(2)} MB，实例 ${(out.sumInst / 1048576).toFixed(2)} MB`);
    console.log(`几何 ${out.totalGeos} 个，重复 ${out.dupGeos} 个（${(100 * out.dupGeos / Math.max(1, out.totalGeos)).toFixed(1)}%），唯一 ${out.seen.size} 个`);
    console.log(`全局去重：${(sumGeo / 1048576).toFixed(2)} MB → ${(dedupedGeo / 1048576).toFixed(2)} MB（省 ${(100 * out.dupBytes / Math.max(1, sumGeo)).toFixed(1)}%）`);
    console.log(`丢弃法线：可省 ${(out.sumNrm / 1048576).toFixed(2)} MB（占几何 ${(100 * out.sumNrm / Math.max(1, sumGeo)).toFixed(1)}%）`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    probe(f);
}