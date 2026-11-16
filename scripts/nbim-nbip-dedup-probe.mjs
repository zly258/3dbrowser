/**
 * NBIP 属性区段冗余诊断：统计
 *   1) 构件之间“属性名序列（schema）”的重复度
 *   2) 构件之间“整块属性行”完全相同的比例
 *   3) 字符串池的前缀共享潜力
 * 并估算三种编码方式压缩后的大小。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BLOCK_MAGIC = 0x3142424e;
const NBIP_MAGIC = 0x3050424e;
const ROW_VARINT_FLAG = 1;

function readBlockSection(buf, start, end) {
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

function readVarint(dv, state) {
    let result = 0, shift = 0;
    while (true) {
        const b = dv.getUint8(state.o++);
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (shift > 35) throw new Error("varint 越界");
    }
    return result >>> 0;
}

function varintLen(v) { let n = 1; v >>>= 0; while (v >= 0x80) { v >>>= 7; n++; } return n; }

function probe(file) {
    const buf = fs.readFileSync(file);
    const po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const nbip = readBlockSection(buf, po, po + pl);
    if (nbip.readUInt32LE(0) !== NBIP_MAGIC) throw new Error("NBIP magic 不符");
    const flags = nbip.readUInt32LE(8);
    const componentCount = nbip.readUInt32LE(12);
    const rowCount = nbip.readUInt32LE(16);
    const nameCount = nbip.readUInt32LE(20);
    const stringCount = nbip.readUInt32LE(24);
    const stringOffsetsOffset = nbip.readUInt32LE(32);
    const stringPoolOffset = nbip.readUInt32LE(36);
    const componentsOffset = nbip.readUInt32LE(40);
    const namesOffset = nbip.readUInt32LE(44);
    const rowsOffset = nbip.readUInt32LE(48);
    const rowVarint = (flags & ROW_VARINT_FLAG) !== 0;
    const compStride = rowVarint ? 36 : 32;

    const dv = new DataView(nbip.buffer, nbip.byteOffset, nbip.byteLength);
    const components = [];
    for (let i = 0; i < componentCount; i++) {
        const base = componentsOffset + i * compStride;
        const nameId = dv.getUint32(base + 20, true);
        let rowOffset, rowBytes, rc;
        if (rowVarint) {
            rowOffset = dv.getUint32(base + 24, true);
            rc = dv.getUint32(base + 28, true);
            rowBytes = dv.getUint32(base + 32, true);
        } else {
            rc = dv.getUint32(base + 28, true);
            rowOffset = dv.getUint32(base + 24, true) * 8;
            rowBytes = rc * 8;
        }
        const state = { o: rowsOffset + rowOffset };
        const rows = [];
        for (let r = 0; r < rc; r++) {
            let nameRow, valueRow;
            if (rowVarint) { nameRow = readVarint(dv, state); valueRow = readVarint(dv, state); }
            else { nameRow = dv.getUint32(state.o, true); valueRow = dv.getUint32(state.o + 4, true); state.o += 8; }
            rows.push([nameRow, valueRow]);
        }
        components.push({ nameId, rows });
    }

    // 1) schema（nameId 序列）重复度
    const schemaKey = (rows) => rows.map((r) => r[0]).join(",");
    const schemaMap = new Map();
    for (const c of components) {
        const k = schemaKey(c.rows);
        schemaMap.set(k, (schemaMap.get(k) || 0) + 1);
    }

    // 2) 整块行完全相同
    const fullMap = new Map();
    for (const c of components) {
        const k = c.rows.map((r) => r[0] + ":" + r[1]).join(";");
        fullMap.set(k, (fullMap.get(k) || 0) + 1);
    }
    let dedupRows = 0;
    for (const [k, n] of fullMap) dedupRows += (k.split(";").length) * 1; // 唯一块首次存储
    const uniqueRowTotal = [...fullMap.keys()].reduce((s, k) => s + k.split(";").length, 0);

    // 3) 字符串池前缀共享
    const strings = [];
    for (let i = 0; i < stringCount; i++) {
        const s = nbip.readUInt32LE(stringOffsetsOffset + i * 4);
        const e = nbip.readUInt32LE(stringOffsetsOffset + (i + 1) * 4);
        strings.push(nbip.subarray(stringPoolOffset + s, stringPoolOffset + e));
    }
    const poolBytes = componentsOffset - stringPoolOffset;
    // 前向编码（按字典序，共享前缀长度 + 后缀）
    const sorted = [];
    for (let i = 0; i < strings.length; i++) sorted.push({ i, b: strings[i] });
    sorted.sort((a, b) => Buffer.compare(a.b, b.b));
    let frontCoded = 0;
    let prev = Buffer.alloc(0);
    for (const s of sorted) {
        let common = 0;
        while (common < prev.length && common < s.b.length && prev[common] === s.b[common]) common++;
        frontCoded += varintLen(common) + varintLen(s.b.length - common) + (s.b.length - common);
        prev = s.b;
    }

    // 4) 三种编码的压缩后估算
    const gz = (b) => zlib.gzipSync(Buffer.from(b), { level: 9 }).length;
    const currentGz = zlib.gzipSync(nbip, { level: 9 }).length;

    // 方案 A：schema 去重（rows 只存 valueId，nameId 由 schema 提供）
    const schemaList = [...schemaMap.keys()];
    const schemaIndex = new Map(schemaList.map((k, i) => [k, i]));
    const schemaBytes = schemaList.reduce((s, k) => s + 8 + k.split(",").length * 2, 0);
    let valueOnlyBytes = 0;
    for (const c of components) valueOnlyBytes += c.rows.length * 3; // valueId varint ≈ 3B 上界
    const schemaGz = gz(Buffer.concat([Buffer.from(nbip.subarray(0, componentsOffset)), Buffer.alloc(schemaBytes + valueOnlyBytes)]));

    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`构件 ${componentCount}，行 ${rowCount}，属性名 ${nameCount}，字符串 ${stringCount}，NBIP raw ${(nbip.length / 1024).toFixed(1)} KB`);
    console.log(`  字符串池 ${(poolBytes / 1024).toFixed(1)} KB；前向编码（前缀共享）${(frontCoded / 1024).toFixed(1)} KB（省 ${(100 * (1 - frontCoded / poolBytes)).toFixed(1)}%）`);
    console.log(`  构件记录 ${((namesOffset - componentsOffset) / 1024).toFixed(1)} KB，属性名表 ${((rowsOffset - namesOffset) / 1024).toFixed(1)} KB，行表 ${((nbip.length - rowsOffset) / 1024).toFixed(1)} KB`);
    console.log(`  属性名序列（schema）去重：${components.length} 构件 → ${schemaMap.size} 种唯一 schema（重复度 ${(100 * (1 - schemaMap.size / components.length)).toFixed(1)}%）`);
    console.log(`  整块属性行完全相同的构件：${fullMap.size} 种（行数 ${uniqueRowTotal} / ${rowCount}，冗余 ${(100 * (1 - uniqueRowTotal / rowCount)).toFixed(1)}%）`);
    console.log(`  当前整库 gzip：${(currentGz / 1024).toFixed(1)} KB`);
    console.log(`  方案A（schema 去重 + valueId 列）估算 gzip：${(schemaGz / 1024).toFixed(1)} KB`);
    return { schemaMap, fullMap, frontCoded, poolBytes };
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    probe(f);
}