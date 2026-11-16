/**
 * 准备浏览器解码基准数据：把真实分块负载/属性区段分别用 gzip-6、brotli-9、brotli-11 压好放到 public 下。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.join(process.cwd(), "public", "__codecbench");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 用法：node scripts/prepare-codec-bench.mjs <文件.nbim> [...]
const sources = process.argv.slice(2);
if (!sources.length) {
    console.error("用法: prepare-codec-bench.mjs <文件.nbim> [...]");
    process.exit(1);
}

const manifest = [];
for (const file of sources) {
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12), po = buf.readUInt32LE(16), pl = buf.readUInt32LE(20);
    const meta = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));
    const name = path.basename(file, ".nbim").replace(/[^\w.-]/g, "_");

    // 分块负载
    const payloads = [];
    for (const c of meta.chunks) {
        const raw = buf.subarray(c.byteOffset, c.byteOffset + c.byteLength);
        payloads.push(zlib.gunzipSync(raw.subarray(16, 16 + raw.readUInt32LE(12))));
    }
    const chunkRaw = Buffer.concat(payloads);

    // 属性区段
    const section = buf.subarray(po, po + pl);
    const blockCount = section.readUInt32LE(12);
    const parts = [];
    let hc = 20;
    for (let i = 0; i < blockCount; i++) {
        const off = section.readUInt32LE(hc), cl = section.readUInt32LE(hc + 4);
        hc += 12;
        parts.push(zlib.gunzipSync(section.subarray(off, off + cl)));
    }
    const nbipRaw = Buffer.concat(parts);

    for (const [kind, raw] of [["chunk", chunkRaw], ["nbip", nbipRaw]]) {
        const base = `${name}.${kind}`;
        const variants = {
            "gzip-6": zlib.gzipSync(raw, { level: 6 }),
            "br-9": zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 } }),
            "br-11": zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 } })
        };
        for (const [codec, bytes] of Object.entries(variants)) {
            const fileName = `${base}.${codec}.bin`;
            fs.writeFileSync(path.join(outDir, fileName), bytes);
            manifest.push({ file: fileName, codec, kind, rawLength: raw.length, compressedLength: bytes.length });
        }
    }
    console.log(`${name}: chunk raw ${(chunkRaw.length / 1024).toFixed(0)} KB, nbip raw ${(nbipRaw.length / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
const total = manifest.reduce((s, m) => s + m.compressedLength, 0);
console.log(`已写出 ${manifest.length} 个样本，合计 ${(total / 1024).toFixed(0)} KB → ${outDir}`);
