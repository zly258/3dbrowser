/** 用分段扫描器统计大文件的几何规模（不解压、不全量 JSON.parse），估算转换耗时。 */
import fs from "node:fs";
import path from "node:path";
import { scanObjectFields } from "./nbim-batch-convert";

const dir = process.argv[2] || "<models>";
const minMB = Number(process.argv[3] || 100);
const files = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".nbim"))
    .map((n) => path.join(dir, n))
    .filter((f) => fs.statSync(f).size / 1048576 >= minMB)
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

console.log("文件".padEnd(46), "文件MB".padStart(8), "manifestMB".padStart(10), "块".padStart(5), "几何rawMB".padStart(10), "预估chunk-q11".padStart(14));
let totalGeo = 0, totalChunks = 0;
for (const file of files) {
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const fields = scanObjectFields(buf, mo, mo + ml);
    const chunksRange = fields.get("chunks");
    const chunks = JSON.parse(buf.toString("utf8", chunksRange!.start, chunksRange!.end));
    const geoRaw = chunks.reduce((s: number, c: any) => s + (c.decodedLength || 0), 0);
    totalGeo += geoRaw; totalChunks += chunks.length;
    const minutes = geoRaw / 1048576 / 0.6 / 60; // 实测 brotli q11 ≈ 0.6 MB/s
    console.log(
        path.basename(file).padEnd(46),
        (buf.length / 1048576).toFixed(0).padStart(8),
        (ml / 1048576).toFixed(0).padStart(10),
        String(chunks.length).padStart(5),
        (geoRaw / 1048576).toFixed(1).padStart(10),
        (minutes.toFixed(1) + " min").padStart(14)
    );
}
console.log(`\n合计：${files.length} 个文件，${totalChunks} 块，几何 raw ${(totalGeo / 1048576).toFixed(0)} MB → brotli q11 约 ${(totalGeo / 1048576 / 0.6 / 60).toFixed(0)} 分钟`);
