/**
 * 压缩变换实验：对真实分块数据尝试几种无损/近无损变换，比较 gzip 后的体积。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const NBV1 = 0x3156424e;
const INDEX_NONE = 0, INDEX_U16 = 1, INDEX_U32 = 2;
const FLAG_NORMAL = 1;

function decodeChunkPayloadV11(payload) {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const geometries = [];
    for (let i = 0; i < geoCount; i++) {
        const vertCount = dv.getUint32(o, true); o += 4;
        const indexCount = dv.getUint32(o, true); o += 4;
        const indexType = dv.getUint8(o); o += 1;
        const flags = dv.getUint8(o); o += 1;
        o += 2;
        const bounds = [];
        for (let k = 0; k < 6; k++) { bounds.push(dv.getFloat32(o, true)); o += 4; }
        const pos = new Uint16Array(vertCount * 3);
        for (let k = 0; k < vertCount * 3; k++) { pos[k] = dv.getUint16(o, true); o += 2; }
        let nrm = null;
        if (flags & FLAG_NORMAL) {
            nrm = new Int8Array(vertCount * 3);
            for (let k = 0; k < vertCount * 3; k++) { nrm[k] = dv.getInt8(o); o += 1; }
        }
        let idx = null;
        if (indexType === INDEX_U16) { idx = new Uint32Array(indexCount); for (let k = 0; k < indexCount; k++) { idx[k] = dv.getUint16(o, true); o += 2; } }
        else if (indexType === INDEX_U32) { idx = new Uint32Array(indexCount); for (let k = 0; k < indexCount; k++) { idx[k] = dv.getUint32(o, true); o += 4; } }
        geometries.push({ vertCount, indexCount, bounds, pos, nrm, idx, indexType });
    }
    return geometries;
}

function gz(bytes) { return zlib.gzipSync(Buffer.from(bytes), { level: 9 }).length; }

/** 八面体编码法线：3B → 2B */
function octEncode(nx, ny, nz) {
    const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
    let x = nx / l1, y = ny / l1, z = nz / l1;
    if (z < 0) {
        const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
        const oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
        x = ox; y = oy;
    }
    return [Math.round((x * 0.5 + 0.5) * 255), Math.round((y * 0.5 + 0.5) * 255)];
}

/** 按首次使用顺序重排顶点，返回新顺序下的索引与重排后的顶点数据 */
function remapByFirstUse(geo) {
    const vertCount = geo.vertCount;
    const remap = new Int32Array(vertCount).fill(-1);
    const order = new Int32Array(vertCount);
    let next = 0;
    const idx = geo.idx || new Uint32Array(vertCount).map((_, i) => i);
    const newIdx = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) {
        const old = idx[i];
        if (remap[old] < 0) { remap[old] = next; order[next] = old; next++; }
        newIdx[i] = remap[old];
    }
    for (let v = 0; v < vertCount; v++) if (remap[v] < 0) { remap[v] = next; order[next] = v; next++; }
    const newPos = new Uint16Array(vertCount * 3);
    const newNrm = geo.nrm ? new Int8Array(vertCount * 3) : null;
    const newOct = geo.nrm ? new Uint8Array(vertCount * 2) : null;
    for (let v = 0; v < vertCount; v++) {
        const old = order[v];
        newPos[v * 3] = geo.pos[old * 3];
        newPos[v * 3 + 1] = geo.pos[old * 3 + 1];
        newPos[v * 3 + 2] = geo.pos[old * 3 + 2];
        if (newNrm) {
            newNrm[v * 3] = geo.nrm[old * 3];
            newNrm[v * 3 + 1] = geo.nrm[old * 3 + 1];
            newNrm[v * 3 + 2] = geo.nrm[old * 3 + 2];
        }
        if (newOct) {
            const [a, b] = octEncode(geo.nrm[old * 3], geo.nrm[old * 3 + 1], geo.nrm[old * 3 + 2]);
            newOct[v * 2] = a; newOct[v * 2 + 1] = b;
        }
    }
    return { newIdx, newPos, newNrm, newOct };
}

function deltaIndices(idx) {
    const out = new Uint32Array(idx.length);
    let prev = 0;
    for (let i = 0; i < idx.length; i++) { out[i] = (idx[i] - prev) >>> 0; prev = idx[i]; }
    return out;
}

function analyze(file) {
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const manifest = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));
    const chunk = manifest.chunks[0];
    const raw = buf.subarray(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    const payloadLength = raw.readUInt32LE(8), compressedLength = raw.readUInt32LE(12);
    const payload = zlib.gunzipSync(raw.subarray(16, 16 + compressedLength));
    const geos = decodeChunkPayloadV11(payload);

    let base = { pos: 0, nrm: 0, oct: 0, idx: 0, idxDelta: 0, baseGz: 0 };
    let remapped = { pos: 0, nrm: 0, oct: 0, idx: 0, idxDelta: 0, allGz: 0, allGzNoNrm: 0 };
    let totalVerts = 0, totalIdx = 0;

    for (const geo of geos) {
        totalVerts += geo.vertCount;
        totalIdx += geo.indexCount;
        base.pos += gz(new Uint8Array(geo.pos.buffer, geo.pos.byteOffset, geo.pos.byteLength));
        base.nrm += gz(new Uint8Array(geo.nrm.buffer, geo.nrm.byteOffset, geo.nrm.byteLength));
        const oct = new Uint8Array(geo.vertCount * 2);
        for (let v = 0; v < geo.vertCount; v++) {
            const [a, b] = octEncode(geo.nrm[v * 3], geo.nrm[v * 3 + 1], geo.nrm[v * 3 + 2]);
            oct[v * 2] = a; oct[v * 2 + 1] = b;
        }
        base.oct += gz(oct);
        if (geo.idx) {
            base.idx += gz(new Uint8Array(geo.idx.buffer, geo.idx.byteOffset, geo.idx.byteLength));
            const d = deltaIndices(geo.idx);
            base.idxDelta += gz(new Uint8Array(d.buffer, 0, d.byteLength));
        }
        const r = remapByFirstUse(geo);
        remapped.pos += gz(new Uint8Array(r.newPos.buffer, 0, r.newPos.byteLength));
        remapped.nrm += gz(new Uint8Array(r.newNrm.buffer, 0, r.newNrm.byteLength));
        remapped.oct += gz(r.newOct);
        remapped.idx += gz(new Uint8Array(r.newIdx.buffer, 0, r.newIdx.byteLength));
        const dr = deltaIndices(r.newIdx);
        remapped.idxDelta += gz(new Uint8Array(dr.buffer, 0, dr.byteLength));
        // 整体：位置+法线+索引 一起压（模拟单块单流）
        const joined = Buffer.concat([Buffer.from(r.newPos.buffer), Buffer.from(r.newNrm.buffer), Buffer.from(r.newIdx.buffer)]);
        remapped.allGz += gz(joined);
        const joinedNoNrm = Buffer.concat([Buffer.from(r.newPos.buffer), Buffer.from(r.newIdx.buffer)]);
        remapped.allGzNoNrm += gz(joinedNoNrm);
    }

    const sumBase = base.pos + base.nrm + base.idx;
    const sumOct = base.pos + base.oct + base.idx;
    const sumDelta = base.pos + base.nrm + base.idxDelta;
    const sumRemap = remapped.pos + remapped.nrm + remapped.idx;
    const sumRemapDelta = remapped.pos + remapped.nrm + remapped.idxDelta;
    const sumRemapOct = remapped.pos + remapped.oct + remapped.idx;
    const sumRemapOctDelta = remapped.pos + remapped.oct + remapped.idxDelta;

    const kb = (n) => (n / 1024).toFixed(1) + " KB";
    console.log(`\n=== ${path.basename(file)} 第 1 块（几何 ${geos.length}，顶点 ${totalVerts}，索引 ${totalIdx}） ===`);
    console.log(`  现状（u16 位置 + i8 法线 + u16 索引，分量各自 gzip）：${kb(sumBase)}  [位置 ${kb(base.pos)} / 法线 ${kb(base.nrm)} / 索引 ${kb(base.idx)}]`);
    console.log(`  + 八面体法线(2B)：${kb(sumOct)}  (${(100 * (1 - sumOct / sumBase)).toFixed(1)}%)`);
    console.log(`  + 索引 delta：${kb(sumDelta)}  (${(100 * (1 - sumDelta / sumBase)).toFixed(1)}%)`);
    console.log(`  顶点按首次使用重排：${kb(sumRemap)}  (${(100 * (1 - sumRemap / sumBase)).toFixed(1)}%)`);
    console.log(`  重排 + delta：${kb(sumRemapDelta)}  (${(100 * (1 - sumRemapDelta / sumBase)).toFixed(1)}%)`);
    console.log(`  重排 + 八面体法线：${kb(sumRemapOct)}  (${(100 * (1 - sumRemapOct / sumBase)).toFixed(1)}%)`);
    console.log(`  重排 + 八面体 + delta：${kb(sumRemapOctDelta)}  (${(100 * (1 - sumRemapOctDelta / sumBase)).toFixed(1)}%)`);
    console.log(`  单流合并压缩（现状重排后整体 gzip）：${kb(remapped.allGz)}；去掉法线：${kb(remapped.allGzNoNrm)}`);
    console.log(`  实际块文件大小：${kb(chunk.byteLength)}`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    analyze(f);
}