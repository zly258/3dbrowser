/**
 * 独立校验流式 JSON 扫描器：把扫描结果与“整份 JSON.parse”对比。
 * 这是批量转换里处理 1 GB manifest 所依赖的路径，必须在能整份解析的文件上先证明等价。
 */
import fs from "node:fs";
import path from "node:path";
import { scanObjectFields, forEachObjectEntry } from "./nbim-batch-convert";

function hashString(h: number, s: string) {
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xffff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function summarizeDocs(iter: (cb: (key: string, doc: any) => void) => void) {
    let docs = 0, rows = 0, h = 0x811c9dc5;
    iter((key, doc) => {
        docs++;
        const r = Array.isArray(doc?.rows) ? doc.rows : [];
        rows += r.length;
        h = hashString(h, key);
        h = hashString(h, String(doc?.owner ?? "") + "\u0001" + String(doc?.bimId ?? "") + "\u0001" + String(doc?.name ?? "") + "\u0001" + r.length);
        for (const row of r) {
            h = hashString(h, String(row?.group ?? "") + "\u0002" + String(row?.key ?? "") + "\u0002" + String(row?.value ?? ""));
        }
    });
    return { docs, rows, hash: h };
}

const files = process.argv.slice(2);
let failed = 0;
for (const file of files) {
    if (!fs.existsSync(file)) { console.log("missing", file); continue; }
    const buf = fs.readFileSync(file);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const text = buf.toString("utf8", mo, mo + ml);

    // 参考实现：整份解析
    const manifest = JSON.parse(text);
    const reference = summarizeDocs((cb) => {
        for (const key of Object.keys(manifest.bimPropertyDocs || {})) cb(key, manifest.bimPropertyDocs[key]);
    });

    // 被测实现：字节级扫描
    const fields = scanObjectFields(buf, mo, mo + ml);
    const range = fields.get("bimPropertyDocs");
    const scanned = summarizeDocs((cb) => {
        if (!range) return;
        forEachObjectEntry(buf, range.start, range.end, (key, vs, ve) => cb(key, JSON.parse(buf.toString("utf8", vs, ve))));
    });

    const same = reference.docs === scanned.docs && reference.rows === scanned.rows && reference.hash === scanned.hash;
    console.log(
        `${same ? "✓" : "✗"} ${path.basename(file)}  文档 ${scanned.docs}/${reference.docs}  行 ${scanned.rows}/${reference.rows}  指纹 ${scanned.hash === reference.hash ? "一致" : `${scanned.hash}≠${reference.hash}`}`
    );
    if (!same) failed++;
}
if (failed > 0) { console.error(`扫描器校验失败：${failed} 个`); process.exit(1); }
console.log("流式扫描器与整份 JSON.parse 结果完全一致。");
