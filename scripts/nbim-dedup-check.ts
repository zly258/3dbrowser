import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { readChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";

function fnv(buf: Uint8Array, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
}

async function check(file: string) {
    const buf = fs.readFileSync(file);
    const blob = new Blob([buf]);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const manifest = JSON.parse(zlib.gunzipSync(buf.subarray(mo, mo + ml)).toString("utf8"));
    const seen = new Map<number, number>();
    let total = 0, dup = 0;
    for (const c of manifest.chunks) {
        const raw = await blob.slice(c.byteOffset, c.byteOffset + c.byteLength).arrayBuffer();
        const d = await readChunkV11(raw);
        for (const g of d.geometries) {
            total++;
            let h = fnv(new Uint8Array(g.position.buffer, g.position.byteOffset, g.position.byteLength));
            h = fnv(new Uint8Array(g.normal.buffer, g.normal.byteOffset, g.normal.byteLength), h);
            if (g.index) h = fnv(new Uint8Array(g.index.buffer, g.index.byteOffset, g.index.byteLength), h);
            const key = h ^ Math.imul(g.position.length, 0x9e3779b1);
            if (seen.has(key)) { dup++; seen.set(key, seen.get(key)! + 1); } else seen.set(key, 1);
        }
    }
    console.log(path.basename(file), "| 几何", total, "唯一", seen.size, "重复", dup, `(${(100 * dup / Math.max(1, total)).toFixed(1)}%)`);
}

for (const f of process.argv.slice(2)) if (fs.existsSync(f)) await check(f);
