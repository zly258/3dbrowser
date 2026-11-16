/**
 * 验证两种属性编码改动的真实压缩收益（构造真实字节再 gzip，不靠估算）：
 *   A) schema 去重：行表只存 valueId，nameId 由每构件 schemaId 指向共享 schema 表
 *   B) 字符串池前向编码（按字典序共享前缀）
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BLOCK_MAGIC = 0x3142424e;
const NBIP_MAGIC = 0x3050424e;

function readBlockSection(buf, start) {
    if (buf.readUInt32LE(start) !== BLOCK_MAGIC) throw new Error("属性区段 magic 不符");
    const blockCount = buf.readUInt32LE(start + 12);
    const totalLen = buf.readUInt32LE(start + 16);
    const parts = [];
    let o = start + 20;
    for (let i = 0; i < blockCount; i++) {
        const off = buf.readUInt32LE(o), cl = buf.readUInt32LE(o + 4);
        o += 12;
        parts.push(zlib.gunzipSync(buf.subarray(start + off, start + off + cl)));
    }
    const merged = Buffer.concat(parts);
    if (merged.length !== totalLen) throw new Error("解压长度不符");
    return merged;
}

function readVarint(dv, st) {
    let r = 0, sh = 0;
    while (true) { const b = dv.getUint8(st.o++); r |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; if (sh > 35) throw new Error("varint"); }
    return r >>> 0;
}
function varintLen(v) { let n = 1; v >>>= 0; while (v >= 0x80) { v >>>= 7; n++; } return n; }
function pushVarint(out, v) { v >>>= 0; while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v); }

function gz(b) { return zlib.gzipSync(Buffer.from(b), { level: 9 }).length; }

function analyze(file) {
    const buf = fs.readFileSync(file);
    const po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const nbip = readBlockSection(buf, po);
    if (nbip.readUInt32LE(0) !== NBIP_MAGIC) throw new Error("NBIP magic 不符");

    const componentCount = nbip.readUInt32LE(12);
    const rowCount = nbip.readUInt32LE(16);
    const nameCount = nbip.readUInt32LE(20);
    const stringCount = nbip.readUInt32LE(24);
    const stringOffsetsOffset = nbip.readUInt32LE(32);
    const stringPoolOffset = nbip.readUInt32LE(36);
    const componentsOffset = nbip.readUInt32LE(40);
    const namesOffset = nbip.readUInt32LE(44);
    const rowsOffset = nbip.readUInt32LE(48);

    const dv = new DataView(nbip.buffer, nbip.byteOffset, nbip.byteLength);
    const compStride = 36;

    // 读出每个构件的 (nameId, valueId) 序列
    const comps = [];
    for (let i = 0; i < componentCount; i++) {
        const base = componentsOffset + i * compStride;
        const rowOffset = dv.getUint32(base + 24, true);
        const rc = dv.getUint32(base + 28, true);
        const st = { o: rowsOffset + rowOffset };
        const names = [], values = [];
        for (let r = 0; r < rc; r++) { names.push(readVarint(dv, st)); values.push(readVarint(dv, st)); }
        comps.push({ names, values });
    }

    // ---------- A) schema 去重 ----------
    const schemaIndex = new Map();
    const schemaList = [];
    const compSchema = comps.map((c) => {
        const key = c.names.join(",");
        let idx = schemaIndex.get(key);
        if (idx === undefined) { idx = schemaList.length; schemaIndex.set(key, idx); schemaList.push(c.names); }
        return idx;
    });
    // 构造真实字节：schemas 表 + 构件记录(40B) + values(varint 列)
    const schemaBytes = [];
    pushVarint(schemaBytes, schemaList.length);
    for (const names of schemaList) {
        pushVarint(schemaBytes, names.length);
        for (const n of names) pushVarint(schemaBytes, n);
    }
    const compBytes = new Uint8Array(componentCount * 40);
    const cdv = new DataView(compBytes.buffer);
    for (let i = 0; i < componentCount; i++) {
        const base = componentsOffset + i * compStride;
        const t = i * 40;
        for (let k = 0; k < 6; k++) cdv.setUint32(t + k * 4, dv.getUint32(base + k * 4, true), true);
        cdv.setUint32(t + 24, 0, true);              // rowOffset（值列内偏移，占位）
        cdv.setUint32(t + 28, comps[i].values.length, true);
        cdv.setUint32(t + 32, compSchema[i], true);  // schemaId
        cdv.setUint32(t + 36, 0, true);
    }
    const valueBytes = [];
    for (const c of comps) for (const v of c.values) pushVarint(valueBytes, v);
    const variantA = Buffer.concat([
        Buffer.from(nbip.subarray(0, componentsOffset)),
        Buffer.from(compBytes),
        Buffer.from(nbip.subarray(namesOffset, rowsOffset)),
        Buffer.from(schemaBytes),
        Buffer.from(valueBytes)
    ]);

    // ---------- B) 字符串池前向编码 ----------
    const strings = [];
    for (let i = 0; i < stringCount; i++) {
        const s = nbip.readUInt32LE(stringOffsetsOffset + i * 4);
        const e = nbip.readUInt32LE(stringOffsetsOffset + (i + 1) * 4);
        strings.push(nbip.subarray(stringPoolOffset + s, stringPoolOffset + e));
    }
    const order = strings.map((b, i) => ({ i, b })).sort((a, b) => Buffer.compare(a.b, b.b));
    const frontPool = [];
    const offsets = new Uint8Array((strings.length + 1) * 4);
    const odv = new DataView(offsets.buffer);
    let prev = Buffer.alloc(0);
    for (let k = 0; k < order.length; k++) {
        const b = order[k].b;
        let common = 0;
        while (common < prev.length && common < b.length && prev[common] === b[common]) common++;
        odv.setUint32(k * 4, frontPool.length, true);
        pushVarint(frontPool, common);
        pushVarint(frontPool, b.length - common);
        for (let i = common; i < b.length; i++) frontPool.push(b[i]);
        prev = b;
    }
    odv.setUint32(order.length * 4, frontPool.length, true);
    const variantB = Buffer.concat([
        Buffer.from(nbip.subarray(0, stringOffsetsOffset)),
        Buffer.from(offsets),
        Buffer.from(frontPool),
        Buffer.from(nbip.subarray(componentsOffset))
    ]);

    // ---------- A+B 组合（字符串重排后需要 id 重映射，粗略按同尺寸估算） ----------
    const variantAB = Buffer.concat([
        Buffer.from(nbip.subarray(0, stringOffsetsOffset)),
        Buffer.from(offsets),
        Buffer.from(frontPool),
        Buffer.from(compBytes),
        Buffer.from(nbip.subarray(namesOffset, rowsOffset)),
        Buffer.from(schemaBytes),
        Buffer.from(valueBytes)
    ]);

    const base = gz(nbip);
    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`构件 ${componentCount}，行 ${rowCount}，唯一 schema ${schemaList.length}`);
    console.log(`  当前 NBIP raw ${(nbip.length / 1024).toFixed(1)} KB → gzip ${(base / 1024).toFixed(1)} KB`);
    console.log(`  A schema 去重：raw ${(variantA.length / 1024).toFixed(1)} KB → gzip ${(gz(variantA) / 1024).toFixed(1)} KB（${(100 * (1 - gz(variantA) / base)).toFixed(1)}%）`);
    console.log(`  B 字符串池前向编码：raw ${(variantB.length / 1024).toFixed(1)} KB → gzip ${(gz(variantB) / 1024).toFixed(1)} KB（${(100 * (1 - gz(variantB) / base)).toFixed(1)}%）`);
    console.log(`  A+B：raw ${(variantAB.length / 1024).toFixed(1)} KB → gzip ${(gz(variantAB) / 1024).toFixed(1)} KB（${(100 * (1 - gz(variantAB) / base)).toFixed(1)}%）`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    analyze(f);
}