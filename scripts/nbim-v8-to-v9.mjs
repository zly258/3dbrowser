/**
 * 把 NBIM v8 转换为 v9（量化 + gzip）：
 *   - position: int16 ×3 + 每块 scale/offset（6×float32）
 *   - normal:   int8 ×3（归一化）
 *   - index:    每几何 u16（顶点 <65536）或 u32
 *   - 整个分块 payload 再 gzip
 *
 * 用法：
 *   node scripts/nbim-v8-to-v9.mjs <源v8.nbim> <输出v9.nbim>
 *
 * v8 分块布局（小端）：
 *   u32 geoCount
 *   per geo: u32 vertCount, u32 indexCount, f32 pos[V*3], f32 norm[V*3], u32 index[I]
 *   u32 instanceCount
 *   per instance: u32 bimIdIndex, u32 typeIndex, u32 color, f32 matrix[16], u32 geoIndex
 *
 * v9 容器：
 *   u32 magic 'NBV9' (0x3956424E), u32 flags, u32 payloadLength, u32 compressedLength, gzip(payload)
 * payload：
 *   u32 geoCount, f32 scale[3], f32 offset[3]
 *   per geo: u32 vertCount, u32 indexCount, u8 indexType(0=无,1=u16,2=u32), i16 pos[V*3], i8 norm[V*3], index
 *   instances 段与 v8 完全一致
 */
import fs from "node:fs";
import zlib from "node:zlib";

const MAGIC = 0x4d49424e;
const V9_MAGIC = 0x3956424e;

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("用法: node scripts/nbim-v8-to-v9.mjs <源v8.nbim> <输出v9.nbim>");
  process.exit(1);
}

const inFd = fs.openSync(SRC, "r");
const head = Buffer.alloc(1024);
fs.readSync(inFd, head, 0, 1024, 0);
const magic = head.readUInt32LE(0);
const version = head.readUInt32LE(4);
const manifestOffset = head.readUInt32LE(8);
const manifestLength = head.readUInt32LE(12);
if (magic !== MAGIC || version !== 8) {
  console.error(`不是 NBIM v8 文件（magic=${magic.toString(16)}, version=${version}）`);
  process.exit(1);
}

const manifestBuffer = Buffer.alloc(manifestLength);
fs.readSync(inFd, manifestBuffer, 0, manifestLength, manifestOffset);
const manifest = JSON.parse(manifestBuffer.toString("utf8"));
const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
if (chunks.length === 0) {
  console.error("manifest.chunks 为空");
  process.exit(1);
}

function readChunk(chunk) {
  const length = Number(chunk.byteLength) || 0;
  const buffer = Buffer.alloc(length);
  fs.readSync(inFd, buffer, 0, length, Number(chunk.byteOffset) || 0);
  return buffer;
}

function convertChunk(buffer) {
  let offset = 0;
  const geoCount = buffer.readUInt32LE(offset); offset += 4;

  const geos = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < geoCount; i++) {
    const vertCount = buffer.readUInt32LE(offset); offset += 4;
    const indexCount = buffer.readUInt32LE(offset); offset += 4;
    const posOffset = offset; offset += vertCount * 12;
    const normOffset = offset; offset += vertCount * 12;
    let indexOffset = -1;
    if (indexCount > 0) { indexOffset = offset; offset += indexCount * 4; }

    for (let v = 0; v < vertCount; v++) {
      const x = buffer.readFloatLE(posOffset + v * 12);
      const y = buffer.readFloatLE(posOffset + v * 12 + 4);
      const z = buffer.readFloatLE(posOffset + v * 12 + 8);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    geos.push({ vertCount, indexCount, posOffset, normOffset, indexOffset });
  }

  const instanceOffset = offset;
  const instanceBytes = buffer.subarray(instanceOffset);

  if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 1; }
  const scaleX = Math.max((maxX - minX) / 65535, 1e-6);
  const scaleY = Math.max((maxY - minY) / 65535, 1e-6);
  const scaleZ = Math.max((maxZ - minZ) / 65535, 1e-6);

  let payloadSize = 4 + 24;
  for (const geo of geos) {
    payloadSize += 4 + 4 + 1 + geo.vertCount * 6 + geo.vertCount * 3;
    if (geo.indexCount > 0) payloadSize += geo.vertCount <= 65535 ? geo.indexCount * 2 : geo.indexCount * 4;
  }
  payloadSize += instanceBytes.length;

  const payload = Buffer.alloc(payloadSize);
  let out = 0;
  payload.writeUInt32LE(geoCount, out); out += 4;
  payload.writeFloatLE(scaleX, out); out += 4;
  payload.writeFloatLE(scaleY, out); out += 4;
  payload.writeFloatLE(scaleZ, out); out += 4;
  payload.writeFloatLE(minX, out); out += 4;
  payload.writeFloatLE(minY, out); out += 4;
  payload.writeFloatLE(minZ, out); out += 4;

  for (const geo of geos) {
    payload.writeUInt32LE(geo.vertCount, out); out += 4;
    payload.writeUInt32LE(geo.indexCount, out); out += 4;
    const indexType = geo.indexCount === 0 ? 0 : (geo.vertCount <= 65535 ? 1 : 2);
    payload.writeUInt8(indexType, out); out += 1;

    for (let v = 0; v < geo.vertCount; v++) {
      const x = buffer.readFloatLE(geo.posOffset + v * 12);
      const y = buffer.readFloatLE(geo.posOffset + v * 12 + 4);
      const z = buffer.readFloatLE(geo.posOffset + v * 12 + 8);
      const qx = Math.max(0, Math.min(65535, Math.round((x - minX) / scaleX))) - 32768;
      const qy = Math.max(0, Math.min(65535, Math.round((y - minY) / scaleY))) - 32768;
      const qz = Math.max(0, Math.min(65535, Math.round((z - minZ) / scaleZ))) - 32768;
      payload.writeInt16LE(qx, out); out += 2;
      payload.writeInt16LE(qy, out); out += 2;
      payload.writeInt16LE(qz, out); out += 2;
    }
    for (let v = 0; v < geo.vertCount; v++) {
      for (let c = 0; c < 3; c++) {
        const n = buffer.readFloatLE(geo.normOffset + v * 12 + c * 4);
        const clamped = n > 1 ? 1 : n < -1 ? -1 : n;
        payload.writeInt8(Math.round(clamped * 127), out);
        out += 1;
      }
    }
    if (geo.indexCount > 0) {
      for (let i = 0; i < geo.indexCount; i++) {
        const value = buffer.readUInt32LE(geo.indexOffset + i * 4);
        if (indexType === 1) { payload.writeUInt16LE(value, out); out += 2; }
        else { payload.writeUInt32LE(value, out); out += 4; }
      }
    }
  }

  instanceBytes.copy(payload, out);
  out += instanceBytes.length;
  if (out !== payloadSize) throw new Error(`payload size mismatch: ${out} != ${payloadSize}`);

  const compressed = zlib.gzipSync(payload, { level: 9 });
  const container = Buffer.alloc(16 + compressed.length);
  container.writeUInt32LE(V9_MAGIC, 0);
  container.writeUInt32LE(0, 4);
  container.writeUInt32LE(payload.length, 8);
  container.writeUInt32LE(compressed.length, 12);
  compressed.copy(container, 16);

  return { container, decodedLength: buffer.length };
}

const outFd = fs.openSync(OUT, "w");
fs.writeSync(outFd, Buffer.alloc(1024), 0, 1024, 0);

let cursor = 1024;
let srcBytes = 0;
let v9Bytes = 0;
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const raw = readChunk(chunk);
  const { container, decodedLength } = convertChunk(raw);
  fs.writeSync(outFd, container, 0, container.length, cursor);

  chunk.byteOffset = cursor;
  chunk.byteLength = container.length;
  chunk.decodedLength = decodedLength;
  chunk.encoding = 9;
  cursor += container.length;
  srcBytes += raw.length;
  v9Bytes += container.length;

  if ((i + 1) % 50 === 0 || i === chunks.length - 1) {
    process.stdout.write(`\r转换 ${i + 1}/${chunks.length}  `);
  }
}
process.stdout.write("\n");

const v9Manifest = { ...manifest, version: 9, chunks };
delete v9Manifest.bimProperties; // 属性走 bimPropertyDocs；旧字段保留会重复占体积
const manifestText = Buffer.from(JSON.stringify(v9Manifest), "utf8");

const header = Buffer.alloc(1024);
header.writeUInt32LE(MAGIC, 0);
header.writeUInt32LE(9, 4);
header.writeUInt32LE(cursor, 8);
header.writeUInt32LE(manifestText.length, 12);
fs.writeSync(outFd, manifestText, 0, manifestText.length, cursor);
fs.writeSync(outFd, header, 0, 1024, 0);
fs.closeSync(outFd);
fs.closeSync(inFd);

const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(`完成: ${SRC} (${mb(fs.statSync(SRC).size)} MB) -> ${OUT} (${mb(fs.statSync(OUT).size)} MB), 分块 ${mb(srcBytes)} -> ${mb(v9Bytes)} MB, 压缩比 ${(v9Bytes / srcBytes * 100).toFixed(1)}%`);