/**
 * 旧版 NBIM（v8/v9）→ 新版 v11 单文件（.nbim）一次性迁移工具。
 * 用法：npm run migrate:nbim -- <旧文件.nbim> [输出目录]
 * 迁移后立即用 v11 读取器回读做完整性校验。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as THREE from "three";
import { buildNbim11File, readNbimHeader, readNbimManifest, NBIM11_MAGIC, NBIM11_VERSION } from "../src/utils/scene-core/nbimIO";
import { encodeNbip, NbipDatabase } from "../src/utils/scene-core/nbip";
import { compressInBlocks, BlockCompressedSource } from "../src/utils/scene-core/nbimBlock";
import { buildChunkPayloadV11, frameChunkV11, readChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";

const LEGACY_MAGIC = 0x4d49424e;
const V9_CHUNK_MAGIC = 0x3956424e;

function decodeLegacyV9Payload(payload: Buffer): any[] {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const scaleX = dv.getFloat32(o, true); o += 4;
    const scaleY = dv.getFloat32(o, true); o += 4;
    const scaleZ = dv.getFloat32(o, true); o += 4;
    const offX = dv.getFloat32(o, true); o += 4;
    const offY = dv.getFloat32(o, true); o += 4;
    const offZ = dv.getFloat32(o, true); o += 4;
    const scales = [scaleX, scaleY, scaleZ];
    const offsets = [offX, offY, offZ];

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
    return items;
}

function legacyBimPropertiesToDocs(bimProperties: Record<string, any>) {
    const docs: Record<string, any> = {};
    for (const [key, value] of Object.entries(bimProperties || {})) {
        const sep = key.indexOf("::");
        const owner = sep > 0 ? key.slice(0, sep) : "";
        const bimId = sep >= 0 ? key.slice(sep + 2) : key;
        const rows: any[] = [
            { group: "基本信息", key: "名称", value: String(value?.name || ""), path: "基本信息.名称", source: "legacy", rawKey: "Name" },
            { group: "基本信息", key: "BIM_ID", value: bimId, path: "基本信息.BIM_ID", source: "legacy", rawKey: "BIM_ID" }
        ];
        docs[key] = { owner, bimId, uuid: String(value?.uuid || bimId), name: String(value?.name || ""), rows };
    }
    return docs;
}

async function main() {
    const input = process.argv[2];
    if (!input) throw new Error("用法: npm run migrate:nbim -- <旧文件.nbim> [输出目录]");
    const outDir = process.argv[3] || path.join(path.dirname(input), "_v11");
    fs.mkdirSync(outDir, { recursive: true });

    const buf = fs.readFileSync(input);
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    if (magic !== LEGACY_MAGIC) throw new Error("不是有效的旧版 NBIM 文件");
    if (version !== 8 && version !== 9) throw new Error(`旧版版本 ${version} 不在支持范围`);

    const manifest = JSON.parse(buf.subarray(manifestOffset, manifestOffset + manifestLength).toString("utf8"));
    const bimIdTable: string[] = Array.isArray(manifest.bimIdTable) ? manifest.bimIdTable : [""];
    const bimIdToIndex = new Map<string, number>();
    bimIdTable.forEach((id, index) => { if (id) bimIdToIndex.set(String(id), index); });

    const docs = manifest.bimPropertyDocs
        ? manifest.bimPropertyDocs
        : legacyBimPropertiesToDocs(manifest.bimProperties || {});

    const stem = path.basename(input).replace(/\.nbim$/i, "");
    const chunkBlobs: Uint8Array[] = [];
    const exportChunks: any[] = [];
    const oldChunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];

    for (let index = 0; index < oldChunks.length; index++) {
        const entry = oldChunks[index];
        const rawChunk = buf.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength);
        if (version !== 9) throw new Error("仅支持 v9 旧文件迁移");
        if (rawChunk.readUInt32LE(0) !== V9_CHUNK_MAGIC) throw new Error(`分块 ${index} 不是 v9 分块`);
        const payloadLength = rawChunk.readUInt32LE(8);
        const compressedLength = rawChunk.readUInt32LE(12);
        const payload = zlib.gunzipSync(rawChunk.subarray(16, 16 + compressedLength));
        if (payload.length !== payloadLength) throw new Error(`分块 ${index} 解压长度不符`);

        const items = decodeLegacyV9Payload(payload);
        const v11Payload = buildChunkPayloadV11(items, bimIdToIndex, (item: any) => bimIdTable[item.bimIdIndex] ?? item.bimId);
        const framed = await frameChunkV11(v11Payload);
        chunkBlobs.push(framed);
        exportChunks.push({
            id: entry.id,
            bounds: entry.bounds,
            originalUuid: entry.originalUuid,
            byteOffset: 0,
            byteLength: framed.byteLength,
            decodedLength: v11Payload.byteLength,
            encoding: NBIM11_VERSION
        });
    }

    const encodedPropertyDb = encodeNbip(docs, stem);
    const propertySection = await compressInBlocks(encodedPropertyDb.bytes);
    const { file } = await buildNbim11File({
        chunkBlobs,
        chunkEntries: exportChunks,
        propertySection,
        propertyInfo: {
            length: propertySection.byteLength,
            components: encodedPropertyDb.stats.components,
            rows: encodedPropertyDb.stats.rows,
            encoding: "block-gzip"
        },
        manifest: {
            globalBounds: manifest.globalBounds,
            chunks: exportChunks,
            stats: manifest.stats || { meshes: exportChunks.length, faces: 0, memory: 0 },
            structureTree: manifest.structureTree,
            bimIdTable
        }
    });

    const outputPath = path.join(outDir, `${stem}.nbim`);
    fs.writeFileSync(outputPath, Buffer.from(file));
    console.log(`已迁移: ${path.basename(input)} (v${version}) -> v11 单文件`);
    console.log(`  输出: ${outputPath} (${file.byteLength} B)`);
    console.log(`  属性: ${encodedPropertyDb.stats.components} 构件 / ${encodedPropertyDb.stats.rows} 行`);

    // ---------- 回读校验 ----------
    const fileBlob = new Blob([fs.readFileSync(outputPath)]);
    const header2 = await readNbimHeader(fileBlob);
    const manifest2: any = await readNbimManifest(fileBlob, header2);
    let ok = true;
    const fail = (msg: string) => { ok = false; console.error(`  ✗ ${msg}`); };
    const pass = (msg: string) => console.log(`  ✓ ${msg}`);
    if (header2.magic !== NBIM11_MAGIC || header2.version !== 11) fail("文件头 v11 校验失败"); else pass("文件头 magic=NBM1 / version=11");
    if (!manifest2.propertyDb || manifest2.propertyDb.encoding !== "block-gzip") fail("属性区段缺失"); else pass("属性区段内嵌（block-gzip）");

    let totalInstances = 0;
    let totalFaces = 0;
    for (let i = 0; i < manifest2.chunks.length; i++) {
        const c = manifest2.chunks[i];
        const chunkBuf = await fileBlob.slice(c.byteOffset, c.byteOffset + c.byteLength).arrayBuffer();
        try {
            const decoded = await readChunkV11(chunkBuf);
            const geoFaces = decoded.geometries.map((g) => (g.index && g.index.length > 0 ? g.index.length / 3 : g.position.length / 9));
            totalInstances += decoded.instances.length;
            for (const inst of decoded.instances) totalFaces += geoFaces[inst.geoIdx] || 0;
        } catch (e) {
            fail(`分块 ${i} 解压/解析失败: ${(e as Error).message}`);
        }
    }
    pass(`全部分块解码成功（${manifest2.chunks.length} 块，实例 ${totalInstances}，三角面 ${Math.round(totalFaces)}）`);

    const sectionSource = await BlockCompressedSource.open(fileBlob, header2.propertyOffset, header2.propertyOffset + header2.propertyLength);
    const db = await NbipDatabase.open(sectionSource, `${stem}.nbim`);
    pass(`属性库打开成功：${JSON.stringify(db.getStats())}`);

    const sample: any[] = [];
    const walk = (node: any) => {
        if (sample.length >= 5 || !node) return;
        if (node.bimId !== undefined && node.bimId !== null && String(node.bimId) !== "") sample.push(node);
        (node.children || []).forEach(walk);
    };
    walk(manifest2.structureTree);
    let sampled = 0;
    for (const node of sample) {
        const doc = await db.getDocumentByKey(String(node.bimId));
        if (doc && doc.rows.length > 0) sampled++;
    }
    if (sample.length > 0 && sampled === 0) fail("抽样读取属性失败（按 bimId 无命中）");
    else pass(`抽样 ${sample.length} 个结构节点，成功读取 ${sampled} 个属性文档`);

    if (!ok) throw new Error("迁移后回读校验存在失败项");
    console.log("迁移后回读校验全部通过。");
}

main().catch((error) => { console.error(error); process.exit(1); });
