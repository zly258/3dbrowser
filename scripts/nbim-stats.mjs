/**
 * 读取 NBIM v11 文件的属性区段统计（构件数 / 属性行数 / 字符串数 / 各段体积），
 * 用于生成 docs/stats-nbim11.md 中的数据。只读，不修改文件。
 *
 * 用法：node scripts/nbim-stats.mjs <文件1.nbim> [文件2.nbim ...]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const NBIM11_MAGIC = 0x314d424e;
const BLOCK_MAGIC_GZIP = 0x3142424e;   // "NBB1"
const BLOCK_MAGIC_BROTLI = 0x3342424e; // "NBB3"
const NBIP_MAGIC = 0x3050424e;         // "NBP0"

function decompress(buf, brotli) {
    return brotli ? zlib.brotliDecompressSync(buf) : zlib.gunzipSync(buf);
}

function readStats(file) {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32LE(0) !== NBIM11_MAGIC) throw new Error("不是 NBIM v11 文件");
    const version = buf.readUInt32LE(4);
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    const propertyOffset = buf.readUInt32LE(16);
    const propertyLength = buf.readUInt32LE(20);
    const flags = buf.readUInt32LE(24);

    // 属性区段：块压缩容器
    const blockMagic = buf.readUInt32LE(propertyOffset);
    const brotli = blockMagic === BLOCK_MAGIC_BROTLI;
    if (blockMagic !== BLOCK_MAGIC_GZIP && !brotli) throw new Error(`未知块魔数 0x${blockMagic.toString(16)}`);
    const blockSize = buf.readUInt32LE(propertyOffset + 8);
    const blockCount = buf.readUInt32LE(propertyOffset + 12);
    const uncompressedLength = buf.readUInt32LE(propertyOffset + 16);

    // 解出第一块，读 NBIP 头（足够拿到 components/rows/strings 计数）
    const entriesOffset = propertyOffset + 20;
    const firstOffset = buf.readUInt32LE(entriesOffset);
    const firstLength = buf.readUInt32LE(entriesOffset + 4);
    const firstBlock = decompress(buf.subarray(propertyOffset + firstOffset, propertyOffset + firstOffset + firstLength), brotli);
    if (firstBlock.readUInt32LE(0) !== NBIP_MAGIC) throw new Error("属性区段不是 NBIP");
    const nbipVersion = firstBlock.readUInt32LE(4);
    const nbipFlags = firstBlock.readUInt32LE(8);
    // 头布局：12=componentCount, 16=rowCount, 20=nameCount, 24=stringCount
    const componentCount = firstBlock.readUInt32LE(12);
    const rowCount = firstBlock.readUInt32LE(16);
    const nameCount = firstBlock.readUInt32LE(20);
    const stringCount = firstBlock.readUInt32LE(24);

    return {
        file: path.basename(file),
        version,
        fileBytes: buf.length,
        propertyBytes: propertyLength,
        blockCodec: brotli ? "brotli" : "gzip",
        blockSize,
        blockCount,
        nbipUncompressed: uncompressedLength,
        nbipVersion,
        nbipFlags,
        components: componentCount,
        rows: rowCount,
        strings: stringCount,
        manifestBytes: manifestLength,
        manifestCodec: (flags & 4) ? "brotli" : (flags & 1) ? "gzip" : "none",
        chunkBytes: propertyOffset - 1024
    };
}

const files = process.argv.slice(2);
if (!files.length) {
    console.error("用法: node scripts/nbim-stats.mjs <文件.nbim> [...]");
    process.exit(1);
}
const rows = [];
for (const f of files) {
    try {
        const s = readStats(f);
        rows.push(s);
        const mb = (n) => (n / 1048576).toFixed(2) + " MB";
        console.log(
            `${s.file}\n` +
            `  版本 v${s.version}  文件 ${mb(s.fileBytes)}  分块区 ${mb(s.chunkBytes)}  属性区 ${mb(s.propertyBytes)}  manifest ${mb(s.manifestBytes)}\n` +
            `  属性块 ${s.blockCodec} ${s.blockSize} B × ${s.blockCount} 块  NBIP v${s.nbipVersion} flags=${s.nbipFlags}  raw ${mb(s.nbipUncompressed)}\n` +
            `  构件 ${s.components}  属性行 ${s.rows}  字符串 ${s.strings}  manifest 编码 ${s.manifestCodec}`
        );
    } catch (e) {
        console.error(`${path.basename(f)}  错误: ${e.message}`);
        process.exitCode = 2;
    }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
