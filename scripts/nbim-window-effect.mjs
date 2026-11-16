/**
 * 量化“窗口大小”对压缩率的影响：gzip 窗口只有 32 KB，
 * 对比「逐块独立压缩」与「全部负载单流压缩」，判断换成大窗口编码器（brotli/zstd）能拿到多少。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function gz(b, level = 6) { return zlib.gzipSync(b, { level }).length; }
function br(b, q = 11) {
    return zlib.brotliCompressSync(b, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 }
    }).length;
}

function analyze(file) {
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12), po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const manifest = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));

    const payloads = [];
    for (const c of manifest.chunks) {
        const raw = buf.subarray(c.byteOffset, c.byteOffset + c.byteLength);
        payloads.push(zlib.gunzipSync(raw.subarray(16, 16 + raw.readUInt32LE(12))));
    }
    const joined = Buffer.concat(payloads);
    let perChunkGz = 0, perChunkBr = 0;
    for (const p of payloads) { perChunkGz += gz(p); perChunkBr += br(p); }

    const wholeGz = gz(joined), wholeGz9 = gz(joined, 9), wholeBr = br(joined);

    console.log(`\n=== ${path.basename(file)}（${payloads.length} 块，raw ${(joined.length / 1024).toFixed(1)} KB）===`);
    console.log(`  逐块 gzip-6（当前）：${(perChunkGz / 1024).toFixed(1)} KB`);
    console.log(`  逐块 brotli-11：    ${(perChunkBr / 1024).toFixed(1)} KB（−${(100 * (1 - perChunkBr / perChunkGz)).toFixed(1)}%）`);
    console.log(`  单流 gzip-6（大窗口效果）：${(wholeGz / 1024).toFixed(1)} KB（−${(100 * (1 - wholeGz / perChunkGz)).toFixed(1)}%）`);
    console.log(`  单流 gzip-9：      ${(wholeGz9 / 1024).toFixed(1)} KB（−${(100 * (1 - wholeGz9 / perChunkGz)).toFixed(1)}%）`);
    console.log(`  单流 brotli-11：   ${(wholeBr / 1024).toFixed(1)} KB（−${(100 * (1 - wholeBr / perChunkGz)).toFixed(1)}%）`);
    console.log(`  属性区段 ${(pl / 1024).toFixed(1)} KB`);
}

for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) { console.log("missing", f); continue; }
    analyze(f);
}
