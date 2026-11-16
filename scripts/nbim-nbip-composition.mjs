/**
 * 统计 v11 文件内属性区段（NBIP）的构成，找出字符串池/行记录里可压缩的空间。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BLOCK_MAGIC = 0x3142424e;
const NBIP_MAGIC = 0x3050424e;

function readBlockSection(buf, start, end) {
    const magic = buf.readUInt32LE(start);
    if (magic !== BLOCK_MAGIC) throw new Error("属性区段 magic 不符");
    const blockSize = buf.readUInt32LE(start + 8);
    const blockCount = buf.readUInt32LE(start + 12);
    const totalLen = buf.readUInt32LE(start + 16);
    const parts = [];
    let headerCursor = start + 20;
    for (let i = 0; i < blockCount; i++) {
        const offset = buf.readUInt32LE(headerCursor);
        const compressedLength = buf.readUInt32LE(headerCursor + 4);
        headerCursor += 12;
        parts.push(zlib.gunzipSync(buf.subarray(start + offset, start + offset + compressedLength)));
    }
    const merged = Buffer.concat(parts);
    if (merged.length !== totalLen) throw new Error(`属性区段解压长度不符 ${merged.length} != ${totalLen}`);
    return { bytes: merged, blockSize, blockCount, sectionBytes: end - start };
}

function probe(file) {
    const buf = fs.readFileSync(file);
    const po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const section = readBlockSection(buf, po, po + pl);
    const nbip = section.bytes;
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

    const offBytes = stringPoolOffset - stringOffsetsOffset;
    const poolBytes = componentsOffset - stringPoolOffset;
    const compBytes = namesOffset - componentsOffset;
    const nameBytes = rowsOffset - namesOffset;
    const rowBytes = nbip.length - rowsOffset;

    // 字符串统计
    let numeric = 0, empty = 0, totalChars = 0, maxLen = 0;
    const numRe = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
    for (let i = 0; i < stringCount; i++) {
        const start = nbip.readUInt32LE(stringOffsetsOffset + i * 4);
        const end = nbip.readUInt32LE(stringOffsetsOffset + (i + 1) * 4);
        const len = end - start;
        totalChars += len;
        if (len === 0) empty++;
        if (len > maxLen) maxLen = len;
        if (len > 0 && len < 24) {
            const s = nbip.toString("utf8", stringPoolOffset + start, stringPoolOffset + end);
            if (numRe.test(s)) numeric++;
        }
    }

    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`属性区段（压缩后）${(pl / 1024).toFixed(1)} KB / 块 ${section.blockCount} × ${(section.blockSize / 1024).toFixed(0)} KB → 原始 ${(nbip.length / 1024).toFixed(1)} KB（压缩比 ${(nbip.length / pl).toFixed(2)}×）`);
    console.log(`  构件 ${componentCount}，行 ${rowCount}，属性名 ${nameCount}，字符串 ${stringCount}`);
    console.log(`  字符串池 ${(poolBytes / 1024).toFixed(1)} KB（${(100 * poolBytes / nbip.length).toFixed(1)}%），平均 ${(totalChars / Math.max(1, stringCount)).toFixed(1)} 字符，最长 ${maxLen}`);
    console.log(`  字符串偏移表 ${(offBytes / 1024).toFixed(1)} KB（${(100 * offBytes / nbip.length).toFixed(1)}%）`);
    console.log(`  构件表 ${(compBytes / 1024).toFixed(1)} KB，属性名表 ${(nameBytes / 1024).toFixed(1)} KB，行表 ${(rowBytes / 1024).toFixed(1)} KB（${(100 * rowBytes / nbip.length).toFixed(1)}%）`);
    console.log(`  纯数字字符串 ${numeric}（${(100 * numeric / Math.max(1, stringCount)).toFixed(1)}%），空串 ${empty}`);
    const numericPoolShare = (() => {
        let bytes = 0;
        for (let i = 0; i < stringCount; i++) {
            const start = nbip.readUInt32LE(stringOffsetsOffset + i * 4);
            const end = nbip.readUInt32LE(stringOffsetsOffset + (i + 1) * 4);
            const len = end - start;
            if (len > 0 && len < 24) {
                const s = nbip.toString("utf8", stringPoolOffset + start, stringPoolOffset + end);
                if (numRe.test(s)) bytes += len;
            }
        }
        return bytes;
    })();
    console.log(`  数字字符串占池 ${(numericPoolShare / 1024).toFixed(1)} KB（${(100 * numericPoolShare / Math.max(1, poolBytes)).toFixed(1)}%）`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    probe(f);
}