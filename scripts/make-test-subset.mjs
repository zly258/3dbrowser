/**
 * 从一个大 NBIM 中抽出一个“完整原始模型”的子集，便于小内存回归测试。
 *
 * 用法：
 *   node scripts/make-test-subset.mjs <源.nbim> [输出.nbim] [目标分块数=200]
 *
 * 例：
 *   node scripts/make-test-subset.mjs ^
 *     "C:\Users\me\Downloads\批量导出_20261113_093819.nbim" ^
 *     "D:\models\hf-test\nbim-200chunks.nbim" 200
 *
 * 说明：按 originalUuid 分组，整模型选取，保留原始 globalBounds（用于验证初始视角修复），
 * 过滤结构树与属性文档，重算统计。仅供本地测试，不参与构建。
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3] || "D:\\models\\hf-test\\nbim-200chunks.nbim";
const TARGET_CHUNKS = Number(process.argv[4]) || 200;
if (!SRC) {
  console.error("用法: node scripts/make-test-subset.mjs <源.nbim> [输出.nbim] [目标分块数=200]");
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const fd = fs.openSync(SRC, "r");
const head = Buffer.alloc(1024);
fs.readSync(fd, head, 0, 1024, 0);
const manifestOffset = head.readUInt32LE(8);
const manifestLength = head.readUInt32LE(12);
const mb = Buffer.alloc(manifestLength);
fs.readSync(fd, mb, 0, manifestLength, manifestOffset);
const manifest = JSON.parse(mb.toString("utf8"));

// 按原始模型（originalUuid）分组，取若干完整模型，凑到 ~TARGET_CHUNKS 块。
const byOwner = new Map();
for (const c of manifest.chunks) {
  const o = c.originalUuid || "__none__";
  if (!byOwner.has(o)) byOwner.set(o, []);
  byOwner.get(o).push(c);
}
const owners = [...byOwner.entries()].sort((a, b) => b[1].length - a[1].length);

const chosen = [];
const chosenOwners = [];
for (const [owner, list] of owners) {
  if (chosen.length >= TARGET_CHUNKS) break;
  if (chosen.length + list.length > TARGET_CHUNKS + 40) continue;
  chosen.push(...list);
  chosenOwners.push(owner);
}
console.log("owners:", chosenOwners.length, "chunks:", chosen.length);

// 重新布局：header(1024) + chunk blobs + manifest
let cursor = 1024;
const newChunks = [];
const parts = [];
for (const c of chosen) {
  const len = c.byteLength;
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, c.byteOffset);
  parts.push(buf);
  newChunks.push({ ...c, byteOffset: cursor, byteLength: len });
  cursor += len;
}
fs.closeSync(fd);

const ownerSet = new Set(chosenOwners);
const docs = {};
let docCount = 0;
for (const [key, doc] of Object.entries(manifest.bimPropertyDocs || {})) {
  const owner = key.includes("::") ? key.slice(0, key.indexOf("::")) : (doc.owner || "");
  if (!ownerSet.has(owner)) continue;
  docs[key] = doc;
  docCount++;
}
console.log("docs kept:", docCount);

// 结构树只保留被选中的模型
const tree = JSON.parse(JSON.stringify(manifest.structureTree));
tree.children = (tree.children || []).filter((n) => {
  const owner = n.userData?.originalUuid ? String(n.userData.originalUuid) : n.id;
  return ownerSet.has(owner);
});
console.log("tree roots kept:", tree.children.length);

// 按选中分块重算统计（用真实几何比例 1.556MB/块 的平均值 → 用原始 stats 的比例折算）
const rawBytes = newChunks.reduce((s, c) => s + c.byteLength, 0);
const ratio = manifest.stats.memory / manifest.chunks.reduce((s, c) => s + c.byteLength, 0);
const meshes = chosen.reduce((s, c) => s + (c.meshes || 0), 0);
const newManifest = {
  // 故意保留原始（更大的）globalBounds，用来验证“初始视角不缩成点”的修复
  globalBounds: manifest.globalBounds,
  chunks: newChunks,
  stats: {
    meshes: Math.round(manifest.stats.meshes * (chosen.length / manifest.chunks.length)),
    faces: Math.round(manifest.stats.faces * (chosen.length / manifest.chunks.length)),
    memory: Number((rawBytes * ratio).toFixed(2))
  },
  structureTree: tree,
  bimIdTable: manifest.bimIdTable,
  bimPropertyDocs: docs,
  propertyNameIndex: manifest.propertyNameIndex
};

const manifestBytes = Buffer.from(JSON.stringify(newManifest), "utf8");
const header = Buffer.alloc(1024);
header.writeUInt32LE(0x4d49424e, 0);
header.writeUInt32LE(8, 4);
header.writeUInt32LE(cursor, 8);
header.writeUInt32LE(manifestBytes.length, 12);

fs.writeFileSync(OUT, Buffer.concat([header, ...parts, manifestBytes]));
const st = fs.statSync(OUT);
console.log({
  out: OUT,
  sizeMB: (st.size / 1048576).toFixed(1),
  chunks: newChunks.length,
  rawMB: (rawBytes / 1048576).toFixed(1),
  stats: newManifest.stats
});
