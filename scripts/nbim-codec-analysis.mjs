/**
 * 综合分析：编码器对比（gzip / brotli，后者代表 zstd 级别的强编码器）、
 * 去 gzip 的代价、解压速度、跨分块几何去重的真实收益。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const NBV1 = 0x3156424e;
const INDEX_NONE = 0, INDEX_U16 = 1, INDEX_U32 = 2;

function gz(buf, level = 6) { return zlib.gzipSync(buf, { level }).length; }
function br(buf) { return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 } }).length; }

function fnv(bytes, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
}

/** 把一个分块负载拆成若干“单几何”负载（无实例），用于去重与逐几何压缩。 */
function splitGeometries(payload) {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const spans = [];
    for (let i = 0; i < geoCount; i++) {
        const start = o;
        const vertCount = dv.getUint32(o, true); o += 4;
        const indexCount = dv.getUint32(o, true); o += 4;
        const indexType = dv.getUint8(o); o += 1;
        const flags = dv.getUint8(o); o += 1;
        o += 2;
        o += 24; // bbox
        o += vertCount * 6;
        if (flags & 1) o += vertCount * 3;
        if (indexType === INDEX_U16) o += indexCount * 2;
        else if (indexType === INDEX_U32) o += indexCount * 4;
        spans.push({ start, end: o, vertCount, indexCount });
    }
    const result = [];
    for (const span of spans) {
        // 单几何负载 = u32(1) + 几何字节 + u32(0) 实例数
        const geometryBytes = payload.subarray(span.start, span.end);
        const single = new Uint8Array(4 + geometryBytes.length + 4);
        const sv = new DataView(single.buffer);
        sv.setUint32(0, 1, true);
        single.set(geometryBytes, 4);
        sv.setUint32(4 + geometryBytes.length, 0, true);
        result.push(single);
    }
    // 实例区（用于“去重后每块仍需存的实例数据”）
    const instanceStart = o;
    result.instanceBytes = payload.subarray(instanceStart);
    result.geometryCount = geoCount;
    return result;
}

function analyze(file) {
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12), po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const manifest = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));

    const payloads = [];
    let currentChunkBytes = 0;
    for (const c of manifest.chunks) {
        const raw = buf.subarray(c.byteOffset, c.byteOffset + c.byteLength);
        const payloadLength = raw.readUInt32LE(8);
        const compressedLength = raw.readUInt32LE(12);
        const payload = zlib.gunzipSync(raw.subarray(16, 16 + compressedLength));
        if (payload.length !== payloadLength) throw new Error("解压长度不符");
        payloads.push(payload);
        currentChunkBytes += c.byteLength;
    }

    const totalRaw = payloads.reduce((s, p) => s + p.length, 0);
    let gz6 = 0, gz9 = 0, brSize = 0;
    for (const p of payloads) { gz6 += gz(p, 6); gz9 += gz(p, 9); brSize += br(p); }

    // 属性区段
    const sectionBytes = buf.subarray(po, po + pl);
    const blockCount = sectionBytes.readUInt32LE(12);
    const parts = [];
    let hc = 20;
    for (let i = 0; i < blockCount; i++) {
        const off = sectionBytes.readUInt32LE(hc), cl = sectionBytes.readUInt32LE(hc + 4);
        hc += 12;
        parts.push(zlib.gunzipSync(sectionBytes.subarray(off, off + cl)));
    }
    const nbipRaw = Buffer.concat(parts);
    const nbipGz = gz(nbipRaw, 6), nbipBr = br(nbipRaw);

    // 解压速度（先各压一份，再计时解压）
    const gzCopies = payloads.map((p) => zlib.gzipSync(p, { level: 6 }));
    const brCopies = payloads.map((p) => zlib.brotliCompressSync(p, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
    const t0 = performance.now();
    for (const c of gzCopies) zlib.gunzipSync(c);
    const gunzipMs = performance.now() - t0;
    const t1 = performance.now();
    for (const c of brCopies) zlib.brotliDecompressSync(c);
    const brotliMs = performance.now() - t1;

    // ---- 跨分块几何去重 ----
    const pool = new Map();
    const perChunkGeoIdx = [];
    let geoCountTotal = 0;
    for (const payload of payloads) {
        const geos = splitGeometries(payload);
        const idxs = [];
        for (let i = 0; i < geos.length; i++) {
            geoCountTotal++;
            const key = fnv(geos[i]) ^ Math.imul(geos[i].length, 0x9e3779b1);
            if (!pool.has(key)) pool.set(key, geos[i]);
            idxs.push(key);
        }
        perChunkGeoIdx.push({ idxs, instanceBytes: geos.instanceBytes });
    }
    const uniqueGeoms = [...pool.values()];
    const uniqueRaw = uniqueGeoms.reduce((s, g) => s + g.length, 0);
    let poolPerGeoGz = 0;
    for (const g of uniqueGeoms) poolPerGeoGz += gz(g, 6);
    const poolSingleGz = gz(Buffer.concat(uniqueGeoms.map((g) => Buffer.from(g))), 6);
    let instanceGz = 0;
    for (const c of perChunkGeoIdx) instanceGz += gz(c.instanceBytes, 6);
    const dedupRefsBytes = perChunkGeoIdx.reduce((s, c) => s + c.idxs.length * 4, 0);

    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`当前：分块 ${(currentChunkBytes / 1024).toFixed(1)} KB（gzip-6），属性 ${(pl / 1024).toFixed(1)} KB，文件 ${(buf.length / 1024).toFixed(1)} KB`);
    console.log(`\n[编码器对比] 分块负载 raw ${(totalRaw / 1024).toFixed(1)} KB`);
    console.log(`  gzip-6 ${(gz6 / 1024).toFixed(1)} KB（当前）｜ gzip-9 ${(gz9 / 1024).toFixed(1)} KB（−${(100 * (1 - gz9 / gz6)).toFixed(1)}%）`);
    console.log(`  brotli-11 ${(brSize / 1024).toFixed(1)} KB（−${(100 * (1 - brSize / gz6)).toFixed(1)}%）`);
    console.log(`  不压缩 raw ${(totalRaw / 1024).toFixed(1)} KB（体积 ×${(totalRaw / gz6).toFixed(2)}）`);
    console.log(`  属性区段 raw ${(nbipRaw.length / 1024).toFixed(1)} KB：gzip-6 ${(nbipGz / 1024).toFixed(1)}（当前 ${(pl / 1024).toFixed(1)}）｜ brotli-11 ${(nbipBr / 1024).toFixed(1)} KB（−${(100 * (1 - nbipBr / pl)).toFixed(1)}%）`);
    console.log(`\n[解压速度] gzip ${(totalRaw / 1048576 / (gunzipMs / 1000)).toFixed(0)} MB/s（${gunzipMs.toFixed(1)} ms）｜ brotli ${(totalRaw / 1048576 / (brotliMs / 1000)).toFixed(0)} MB/s（${brotliMs.toFixed(1)} ms）`);
    console.log(`\n[跨分块几何去重] 几何 ${geoCountTotal} 个 → 唯一 ${uniqueGeoms.length}（重复 ${geoCountTotal - uniqueGeoms.length}）`);
    console.log(`  去重后几何 raw ${(uniqueRaw / 1024).toFixed(1)} KB（当前所有分块负载合计 ${(totalRaw / 1024).toFixed(1)} KB）`);
    console.log(`  方案① 几何池逐几何 gzip + 实例列表：${((poolPerGeoGz + instanceGz + dedupRefsBytes) / 1024).toFixed(1)} KB`);
    console.log(`  方案② 几何池单流 gzip + 实例列表：${((poolSingleGz + instanceGz + dedupRefsBytes) / 1024).toFixed(1)} KB`);
    console.log(`  当前分块合计：${(currentChunkBytes / 1024).toFixed(1)} KB`);
    console.log(`  ⇒ 去重收益：方案①${(100 * (1 - (poolPerGeoGz + instanceGz + dedupRefsBytes) / currentChunkBytes)).toFixed(1)}%｜方案②${(100 * (1 - (poolSingleGz + instanceGz + dedupRefsBytes) / currentChunkBytes)).toFixed(1)}%`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    analyze(f);
}