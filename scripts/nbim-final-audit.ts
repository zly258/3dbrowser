/**
 * 最终审计：逐对比较「源 v9」与「目标 v11」
 *  - 属性：文档数、行数、抽样文档的 group/key/value 逐行指纹
 *  - 几何：分块数、首/末分块可解码、实例数量级
 */
import fs from "node:fs";
import path from "node:path";
import { scanObjectFields, forEachObjectEntry, verifyOne } from "./nbim-batch-convert";
import { readNbimHeader, readNbimManifest } from "../src/utils/scene-core/nbimIO";
import { NbipDatabase } from "../src/utils/scene-core/nbip";
import { BlockCompressedSource } from "../src/utils/scene-core/nbimBlock";

function hashPair(h: number, s: string) {
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xffff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

async function audit(srcFile: string, dstFile: string) {
    const name = path.basename(srcFile);
    if (!fs.existsSync(dstFile)) return `✗ ${name} 目标不存在`;

    // ---- 源：扫描属性 ----
    const buf = fs.readFileSync(srcFile);
    const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
    const fields = scanObjectFields(buf, mo, mo + ml);
    const range = fields.get("bimPropertyDocs");
    let srcDocs = 0, srcRows = 0;
    const srcHashes = new Map<string, number>();
    const sampleKeys: string[] = [];
    if (range) {
        forEachObjectEntry(buf, range.start, range.end, (key, vs, ve) => {
            srcDocs++;
            const doc = JSON.parse(buf.toString("utf8", vs, ve));
            const rows = Array.isArray(doc?.rows) ? doc.rows : [];
            srcRows += rows.length;
            // 每 97 个留一个抽样指纹
            if (srcDocs % 97 === 1 && sampleKeys.length < 24) {
                let h = 0x811c9dc5;
                h = hashPair(h, String(doc?.name ?? ""));
                for (const r of rows) h = hashPair(h, `${r?.group}\u0002${r?.key}\u0002${r?.value}`);
                srcHashes.set(key, h);
                sampleKeys.push(key);
            }
        });
    }
    const chunks = JSON.parse(buf.toString("utf8", fields.get("chunks")!.start, fields.get("chunks")!.end));

    // ---- 目标 ----
    const blob = new Blob([fs.readFileSync(dstFile)]);
    const header = await readNbimHeader(blob);
    const manifest: any = await readNbimManifest(blob, header);
    const section = await BlockCompressedSource.open(blob, header.propertyOffset, header.propertyOffset + header.propertyLength);
    const db = await NbipDatabase.open(section, path.basename(dstFile));
    const stats = db.getStats();

    let matched = 0, mismatched = 0;
    for (const key of sampleKeys) {
        const doc = await db.getDocumentByKey(key.split("::").pop() || key);
        if (!doc) { mismatched++; continue; }
        let h = 0x811c9dc5;
        h = hashPair(h, String(doc.name ?? ""));
        for (const r of doc.rows) h = hashPair(h, `${r.group}\u0002${r.key}\u0002${r.value}`);
        if (h === srcHashes.get(key)) matched++; else mismatched++;
    }

    const ok =
        srcDocs === stats.components &&
        srcRows === stats.rows &&
        mismatched === 0 &&
        manifest.chunks.length === chunks.length &&
        stats.components > 0;
    const detail = `文档 ${stats.components}/${srcDocs}，行 ${stats.rows}/${srcRows}，抽样指纹 ${matched}✓/${mismatched}✗，分块 ${manifest.chunks.length}/${chunks.length}`;
    if (!ok) return `✗ ${name}  ${detail}`;
    await verifyOne(dstFile);
    return `✓ ${name}  ${detail}`;
}

// 目标目录：第 2 个参数之后若以 --dst 指定，否则默认取当前工作目录下的 nbim 目录。
const argv = process.argv.slice(2);
const dstIdx = argv.indexOf("--dst");
const dstDir = dstIdx >= 0 ? argv[dstIdx + 1] : process.cwd();
const sources = argv.filter((a, i) => !a.startsWith("--") && (dstIdx < 0 || i !== dstIdx + 1));

const pairs: Array<[string, string]> = [];
for (const src of sources) {
    const name = path.basename(src);
    pairs.push([src, path.join(dstDir, name)]);
}
let bad = 0;
for (const [src, dst] of pairs) {
    const line = await audit(src, dst).catch((e) => `✗ ${path.basename(src)} 异常: ${(e as Error).message}`);
    console.log(line);
    if (line.startsWith("✗")) bad++;
}
console.log(bad === 0 ? "审计全部通过。" : `审计失败 ${bad} 个`);
if (bad > 0) process.exit(1);
