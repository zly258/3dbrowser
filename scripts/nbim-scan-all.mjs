/**
 * 全量扫描目录下所有 .nbim 的文件头/版本/manifest 大小，
 * 并抽样统计 gzip 与 brotli(各档) 的压缩比与耗时，用于判断批量转换是否可行。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const LEGACY_MAGIC = 0x4d49424e;
const V9_CHUNK_MAGIC = 0x3956424e;
const root = process.argv[2] || "<models>";

const files = fs.readdirSync(root)
    .filter((n) => n.toLowerCase().endsWith(".nbim"))
    .map((n) => path.join(root, n));

let totalBytes = 0;
const rows = [];
for (const file of files) {
    const st = fs.statSync(file);
    totalBytes += st.size;
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const magic = head.readUInt32LE(0);
    const version = head.readUInt32LE(4);
    const manifestOffset = head.readUInt32LE(8);
    const manifestLength = head.readUInt32LE(12);
    rows.push({ name: path.basename(file), size: st.size, magic, version, manifestLength, kind: magic === LEGACY_MAGIC ? `旧版v${version}` : magic === 0x314d424e ? `v11` : `未知(${magic.toString(16)})` });
}

const byKind = new Map();
for (const r of rows) {
    const e = byKind.get(r.kind) || { count: 0, bytes: 0 };
    e.count++; e.bytes += r.size;
    byKind.set(r.kind, e);
}
console.log(`文件 ${rows.length} 个，合计 ${(totalBytes / 1073741824).toFixed(2)} GB`);
for (const [kind, e] of byKind) console.log(`  ${kind.padEnd(10)} ${String(e.count).padStart(4)} 个  ${(e.bytes / 1073741824).toFixed(2)} GB`);

const big = rows.filter((r) => r.manifestLength > 400 * 1024 * 1024).sort((a, b) => b.manifestLength - a.manifestLength);
console.log(`\nmanifest > 400 MB（Node/V8 字符串上限 ~512M 字符，直接 JSON.parse 有风险）：${big.length} 个`);
for (const b of big.slice(0, 12)) console.log(`  ${b.name}  manifest ${(b.manifestLength / 1048576).toFixed(0)} MB  文件 ${(b.size / 1048576).toFixed(0)} MB`);

// ---- 抽样：压缩比与速度 ----
const sampleSizes = [0.5, 2, 8, 32, 128, 512, 1200]; // MB 量级
const picked = [];
for (const targetMB of sampleSizes) {
    let best = null;
    for (const r of rows) {
        if (r.version !== 9) continue;
        const mb = r.size / 1048576;
        const d = Math.abs(Math.log2(mb) - Math.log2(targetMB));
        if (!best || d < best.d) best = { r, d };
    }
    if (best && !picked.includes(best.r)) picked.push(best.r);
}

function samplePayloads(file) {
    const buf = fs.readFileSync(file);
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    const manifest = JSON.parse(buf.subarray(manifestOffset, manifestOffset + manifestLength).toString("utf8"));
    const chunks = manifest.chunks || [];
    const payloads = [];
    let compBytes = 0;
    for (const c of chunks.slice(0, 40)) {
        const raw = buf.subarray(c.byteOffset, c.byteOffset + c.byteLength);
        if (raw.readUInt32LE(0) !== V9_CHUNK_MAGIC) continue;
        const payloadLength = raw.readUInt32LE(8);
        const compressedLength = raw.readUInt32LE(12);
        payloads.push(zlib.gunzipSync(raw.subarray(16, 16 + compressedLength)));
        compBytes += c.byteLength;
        if (payloads.reduce((s, p) => s + p.length, 0) > 24 * 1048576) break;
    }
    return { payloads, chunkCount: chunks.length, compBytes };
}

console.log(`\n=== 抽样压缩比 / 速度（每个文件取前若干块，最多 24 MB raw）===`);
for (const r of picked) {
    const file = path.join(root, r.name);
    let s;
    try { s = samplePayloads(file); } catch (e) { console.log(`${r.name}: 解析失败 ${e.message}`); continue; }
    if (!s.payloads.length) { console.log(`${r.name}: 未取到分块`); continue; }
    const joined = Buffer.concat(s.payloads);
    const t0 = performance.now();
    let gz6 = 0;
    for (const p of s.payloads) gz6 += zlib.gzipSync(p, { level: 6 }).length;
    const gzMs = performance.now() - t0;

    const results = {};
    for (const q of [5, 9, 11]) {
        const t = performance.now();
        let size = 0;
        for (const p of s.payloads) {
            size += zlib.brotliCompressSync(p, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 } }).length;
        }
        results[q] = { size, ms: performance.now() - t };
    }
    const mbps = (q) => (joined.length / 1048576 / (results[q].ms / 1000)).toFixed(1);
    console.log(`\n${r.name}  (文件 ${(r.size / 1048576).toFixed(0)} MB, ${s.chunkCount} 块, 抽样 raw ${(joined.length / 1048576).toFixed(1)} MB)`);
    console.log(`  gzip-6 : ${(gz6 / 1024).toFixed(1)} KB  ${gzMs.toFixed(0)} ms`);
    for (const q of [5, 9, 11]) {
        console.log(`  br-${String(q).padEnd(3)}: ${(results[q].size / 1024).toFixed(1)} KB  (${(100 * (1 - results[q].size / gz6)).toFixed(1)}%)  ${results[q].ms.toFixed(0)} ms  ${mbps(q)} MB/s`);
    }
}