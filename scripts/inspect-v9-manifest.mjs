/** 查看 v9 manifest 的顶层字段顺序与文档结构（用于写分段扫描器）。 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
const buf = fs.readFileSync(file);
const mo = buf.readUInt32LE(8), ml = buf.readUInt32LE(12);
const text = buf.subarray(mo, mo + ml).toString("utf8");
console.log("manifest bytes", ml, "文件", path.basename(file));

const keys = [];
let depth = 0, i = 0, inStr = false, esc = false, keyStart = -1;
while (i < text.length) {
    const ch = text[i];
    if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        i++; continue;
    }
    if (ch === '"') { inStr = true; keyStart = i; i++; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === ":" && depth === 1 && keyStart >= 0) { keys.push(JSON.parse(text.slice(keyStart, i))); keyStart = -1; }
    i++;
}
console.log("顶层字段顺序:", keys.join(", "));

const m = JSON.parse(text);
for (const k of keys) {
    const v = m[k];
    const s = JSON.stringify(v);
    const kind = Array.isArray(v) ? `array[${v.length}]` : typeof v;
    console.log(`  ${k}: ${kind} jsonLen=${s.length}`);
}
const dp = m.bimPropertyDocs || {};
const dpk = Object.keys(dp)[0];
if (dpk) console.log("\nbimPropertyDocs key:", dpk, "\n值:", JSON.stringify(dp[dpk]).slice(0, 400));
const bp = m.bimProperties || {};
const bpk = Object.keys(bp)[0];
if (bpk) console.log("\nbimProperties key:", bpk, "\n值:", JSON.stringify(bp[bpk]).slice(0, 300));
if (m.structureTree) console.log("\nstructureTree 字段:", Object.keys(m.structureTree).join(","));
if (m.chunks?.[0]) console.log("chunk[0]:", JSON.stringify(m.chunks[0]).slice(0, 260));
