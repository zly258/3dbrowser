/**
 * v9 → v11 迁移的几何等价性校验（量化后按容差比对）。
 * 原始 v9 解码出的顶点/法线/索引，与 v11 分块解码结果比对；位置容差 = 量化步长。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as THREE from "three";
import { buildChunkPayloadV11, frameChunkV11, readChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";

const LEGACY_MAGIC = 0x4d49424e;
const V9_CHUNK_MAGIC = 0x3956424e;

function decodeV9Payload(payload: Buffer) {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const scales = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;
    const offsets = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < geoCount; i++) {
        const vertCount = dv.getUint32(o, true); o += 4;
        const indexCount = dv.getUint32(o, true); o += 4;
        const indexType = dv.getUint8(o); o += 1;
        const position = new Float32Array(vertCount * 3);
        for (let v = 0; v < vertCount * 3; v++) {
            const q = dv.getInt16(o, true); o += 2;
            position[v] = (q + 32768) * scales[v % 3] + offsets[v % 3];
        }
        const normal = new Float32Array(vertCount * 3);
        for (let v = 0; v < vertCount * 3; v++) { normal[v] = dv.getInt8(o) / 127; o += 1; }
        let index = new Uint32Array(vertCount);
        if (indexCount > 0) {
            index = new Uint32Array(indexCount);
            if (indexType === 1) for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint16(o, true); o += 2; }
            else for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint32(o, true); o += 4; }
        } else {
            for (let k = 0; k < vertCount; k++) index[k] = k;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(position, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
        g.setIndex(new THREE.BufferAttribute(index, 1));
        geometries.push(g);
    }
    const instanceCount = dv.getUint32(o, true); o += 4;
    const items: any[] = [];
    for (let i = 0; i < instanceCount; i++) {
        const bimIdIndex = dv.getUint32(o, true); o += 4;
        const typeIndex = dv.getUint32(o, true); o += 4;
        const color = dv.getUint32(o, true); o += 4;
        const arr = new Float32Array(16);
        for (let k = 0; k < 16; k++) { arr[k] = dv.getFloat32(o, true); o += 4; }
        const geoIdx = dv.getUint32(o, true); o += 4;
        items.push({ bimId: String(bimIdIndex), bimIdIndex, typeIndex, color, matrix: new THREE.Matrix4().fromArray(arr), geometry: geometries[geoIdx] });
    }
    return { items, geometries, consumed: o, bytes: payload.byteLength };
}

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>) {
    if (a.length !== b.length) return { ok: false, max: Infinity, reason: `length ${a.length} != ${b.length}` };
    let max = 0;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > max) max = d;
    }
    return { ok: true, max, reason: "" };
}

/** 解码后的法线是归一化 i8，比较前还原到 [-1,1]。 */
function decodedNormalToFloat(normal: Int8Array) {
    const out = new Float32Array(normal.length);
    for (let i = 0; i < normal.length; i++) out[i] = normal[i] / 127;
    return out;
}

async function main() {
    const input = process.argv[2];
    if (!input) {
        console.error("用法: npm run verify:nbim-geom -- <旧文件.nbim>");
        process.exit(1);
    }
    const buf = fs.readFileSync(input);
    const version = buf.readUInt32LE(4);
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    if (buf.readUInt32LE(0) !== LEGACY_MAGIC) throw new Error("不是旧版 NBIM");
    if (version !== 9) throw new Error("仅支持 v9 深度校验");
    const manifest = JSON.parse(buf.subarray(manifestOffset, manifestOffset + manifestLength).toString("utf8"));
    const bimIdTable: string[] = Array.isArray(manifest.bimIdTable) ? manifest.bimIdTable : [""];
    const bimIdToIndex = new Map<string, number>();
    bimIdTable.forEach((id, i) => { if (id) bimIdToIndex.set(String(id), i); });

    console.log(`校验: ${path.basename(input)} (v${version}, ${manifest.chunks?.length ?? 0} 块)`);
    let failures = 0;
    let comparedVerts = 0, comparedIndices = 0, comparedInstances = 0;
    let maxPosError = 0, maxNrmError = 0, maxMatrixError = 0;
    const POS_TOL = 1e-2;   // 位置量化（u16）后的容差上限
    const NRM_TOL = 0.03;   // 法线 i8 量化容差

    for (let ci = 0; ci < (manifest.chunks || []).length; ci++) {
        const entry = manifest.chunks[ci];
        const raw = buf.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength);
        if (raw.readUInt32LE(0) !== V9_CHUNK_MAGIC) throw new Error(`分块 ${ci} magic 错误`);
        const payloadLength = raw.readUInt32LE(8);
        const compressedLength = raw.readUInt32LE(12);
        const payload = zlib.gunzipSync(raw.subarray(16, 16 + compressedLength));
        if (payload.length !== payloadLength) throw new Error(`分块 ${ci} 解压长度不符`);

        const original = decodeV9Payload(payload);
        if (original.consumed !== original.bytes) throw new Error(`分块 ${ci} 原始负载未完整解析`);

        const v11Payload = buildChunkPayloadV11(original.items, bimIdToIndex, (item: any) => bimIdTable[item.bimIdIndex] ?? item.bimId);
        const framed = await frameChunkV11(v11Payload);
        const decoded = await readChunkV11(framed.buffer.slice(framed.byteOffset, framed.byteOffset + framed.byteLength) as ArrayBuffer);

        if (decoded.geometries.length !== original.geometries.length) {
            console.error(`  ✗ 分块 ${ci}: 几何数不一致`);
            failures++;
            continue;
        }
        let chunkOk = true;
        for (let gi = 0; gi < decoded.geometries.length; gi++) {
            const a = original.geometries[gi];
            const b = decoded.geometries[gi];
            const posA = a.getAttribute("position").array as Float32Array;
            const nrmA = a.getAttribute("normal").array as Float32Array;
            const nrmB = decodedNormalToFloat(b.normal);
            const idxA = a.getIndex()!.array as Uint32Array;
            const posR = maxAbsDiff(posA, b.position);
            const nrmR = maxAbsDiff(nrmA, nrmB);
            const idxR = maxAbsDiff(idxA, b.index || new Uint32Array(0));
            comparedVerts += posA.length / 3;
            comparedIndices += idxA.length;
            if (!posR.ok || posR.max > POS_TOL) { console.error(`  ✗ 分块 ${ci} 几何 ${gi} 顶点误差 ${posR.max}`); chunkOk = false; }
            if (!nrmR.ok || nrmR.max > NRM_TOL) { console.error(`  ✗ 分块 ${ci} 几何 ${gi} 法线误差 ${nrmR.max}`); chunkOk = false; }
            if (!idxR.ok || idxR.max > 0) { console.error(`  ✗ 分块 ${ci} 几何 ${gi} 索引不一致`); chunkOk = false; }
            maxPosError = Math.max(maxPosError, posR.max);
            maxNrmError = Math.max(maxNrmError, nrmR.max);
        }
        if (decoded.instances.length !== original.items.length) {
            console.error(`  ✗ 分块 ${ci}: 实例数不一致`);
            chunkOk = false;
        } else {
            for (let ii = 0; ii < decoded.instances.length; ii++) {
                const a = original.items[ii];
                const b = decoded.instances[ii];
                comparedInstances++;
                const mR = maxAbsDiff(a.matrix.elements, b.matrix as Float32Array);
                if (b.color !== a.color || mR.max > 1e-5) { console.error(`  ✗ 分块 ${ci} 实例 ${ii} 不一致`); chunkOk = false; }
                maxMatrixError = Math.max(maxMatrixError, mR.max);
            }
        }
        if (chunkOk) console.log(`  ✓ 分块 ${ci}: 几何 ${decoded.geometries.length} / 实例 ${decoded.instances.length} 通过容差校验`);
        else failures++;
    }

    console.log(`\n比对规模: 顶点 ${comparedVerts}，索引 ${comparedIndices}，实例 ${comparedInstances}`);
    console.log(`最大误差: 位置 ${maxPosError.toExponential(2)}，法线 ${maxNrmError.toExponential(2)}，矩阵 ${maxMatrixError.toExponential(2)}`);
    if (failures > 0) {
        console.error(`几何等价性校验失败：${failures} 块`);
        process.exit(1);
    }
    console.log("几何等价性校验通过（v9 → v11 量化误差在容差内）。");
}

main().catch((e) => { console.error(e); process.exit(1); });