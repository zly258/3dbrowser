/**
 * NBIM v11 单文件 + NBIP 属性库自测（Node，无需浏览器）。
 * 通过 scripts/run.mjs 用 esbuild 打包后运行（node scripts/run.mjs nbim11-selftest）。
 */
import * as THREE from "three";
import { buildNbimBlobFromObjects } from "../src/utils/scene-manager/nbimBatchConvert";
import {
    readNbimHeader,
    readNbimManifest,
    NBIM11_MAGIC,
    NBIM11_VERSION
} from "../src/utils/scene-core/nbimIO";
import { readChunkV11, frameChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";
import { encodeChunkPayloadV11 } from "../src/utils/scene-core/nbimChunk";
import { encodeNbip, NbipDatabase } from "../src/utils/scene-core/nbip";
import { BlockCompressedSource } from "../src/utils/scene-core/nbimBlock";

let failures = 0;
function check(condition: boolean, message: string, extra?: any) {
    const suffix = extra !== undefined ? ` (${JSON.stringify(extra)})` : "";
    if (condition) {
        console.log(`  ✓ ${message}${suffix}`);
    } else {
        failures++;
        console.error(`  ✗ ${message}${suffix}`);
    }
}

async function testNbipRoundTrip() {
    console.log("[1] NBIP 编解码往返");
    const docs: any = {
        "m::a": { owner: "m", bimId: "a", uuid: "uuid-A", name: "构件A", rows: [
            { group: "基本信息", key: "名称", value: "构件A", path: "基本信息.名称", source: "dgn", rawKey: "Name" },
            { group: "基本信息", key: "类型", value: "梁", path: "基本信息.类型", source: "dgn", rawKey: "Type" }
        ] },
        "m::b": { owner: "m", bimId: "b", uuid: "uuid-B", name: "构件B", rows: [
            { group: "尺寸", key: "长度", value: "12345", path: "尺寸.长度", source: "dgn", rawKey: "Length" }
        ] }
    };
    const encoded = encodeNbip(docs, "model");
    const db = await NbipDatabase.open(new Blob([encoded.bytes]), "t.nbip");
    check(encoded.stats.components === 2, "编码得到 2 个构件");
    check(db.getStats().components === 2 && db.getStats().rows === 3, "解码 header 统计一致");
    const docA = await db.getDocumentByKey("a");
    const docB = await db.getDocumentByKey("b");
    check(!!docA && docA.rows.length === 2 && docA.rows[0].value === "构件A", "按 bimId 读取构件 A 的行正确");
    check(!!docB && docB.rows.length === 1 && docB.rows[0].value === "12345", "按 bimId 读取构件 B 的行正确");
    check((await db.getDocumentByKey("missing")) === null, "不存在的键返回 null");
    const index = await db.getPropertyNameIndex();
    check(index.length === 3, "属性名索引条目数正确（3 个不同属性名）");
}

async function testSingleFileEndToEnd() {
    console.log("[2] v11 单文件端到端（几何 + 属性 + 结构树）");
    const model = new THREE.Group();
    model.name = "ModelX";
    for (let i = 0; i < 2; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1 + i, 1, 1), new THREE.MeshStandardMaterial());
        mesh.name = `Box${i}`;
        mesh.userData.expressID = 100 + i;
        model.add(mesh);
    }
    model.updateMatrixWorld(true);

    const result: any = await buildNbimBlobFromObjects({
        objects: [model],
        fileNames: ["ModelX.nbim"],
        onProgress: () => {}
    } as any);

    check(result.fileName === "ModelX.nbim", "只产生一个 .nbim 文件");
    check(!result.propertyBlob && !result.geometryBlob, "不再产生 .nbip 分离文件");

    const header = await readNbimHeader(result.fileBlob);
    check(header.magic === NBIM11_MAGIC && header.version === NBIM11_VERSION, "文件头 magic=NBM1 / version=11");
    check(header.propertyOffset > 0 && header.propertyLength > 0, "文件内含属性区段", {
        propertyOffset: header.propertyOffset,
        propertyLength: header.propertyLength
    });

    const manifest: any = await readNbimManifest(result.fileBlob, header);
    check(manifest.version === NBIM11_VERSION, "manifest.version=11");
    check(!manifest.bimPropertyDocs && !manifest.bimProperties, "manifest 不内联属性文档");
    check(Array.isArray(manifest.chunks) && manifest.chunks.length === 1, "分块表存在（1 块）");
    check(manifest.propertyDb?.encoding === "block-gzip", "属性区段为分块 gzip");

    const chunk = manifest.chunks[0];
    const encodedChunk = await result.fileBlob.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
    const decoded = await readChunkV11(encodedChunk);
    check(chunk.encoding === 11, "分块 encoding=11");
    check(chunk.decodedLength > 0 && decoded.geometries.length === 2 && decoded.instances.length === 2, "分块几何/实例数量正确（2/2）");
    check(decoded.geometries.every((g) => g.position instanceof Float32Array && g.normal instanceof Int8Array), "位置 float32 / 法线 int8");
    check(decoded.geometries.every((g) => !g.index || g.index instanceof Uint32Array), "索引解码正确");

    const sectionSource = await BlockCompressedSource.open(
        result.fileBlob,
        header.propertyOffset,
        header.propertyOffset + header.propertyLength
    );
    const db = await NbipDatabase.open(sectionSource, result.fileName);
    check(db.getStats().components === 3, "内嵌属性库构件数正确（2 构件 + 1 模型根）");
    const firstNode = manifest.structureTree?.children?.[0]?.children?.[0];
    const doc = firstNode?.bimId ? await db.getDocumentByKey(String(firstNode.bimId)) : null;
    check(!!doc && doc.rows.length > 0, "从同一文件按 bimId 读到属性行");
}

async function testScale() {
    console.log("[3] 属性库规模化（schema 复用 / 前缀共享 / 二分定位）");
    const count = 5000;
    const groups = ["基本信息", "原始数据", "扩展属性"];
    const docs: any = {};
    for (let i = 0; i < count; i++) {
        docs[`m::id_${i}`] = {
            owner: "m",
            bimId: `id_${i}`,
            uuid: `uuid_${i}`,
            name: `构件${i}`,
            rows: Array.from({ length: 8 }).map((_, r) => {
                const group = groups[r % groups.length];
                // 混合中文/ASCII/长值，覆盖前缀共享的字节边界
                const value = r % 3 === 0 ? `值_${i}_${r}` : r % 3 === 1 ? `Value-${i}-${r}-xyz` : `原始数据/元素 ID=${i}${r}`;
                return { group, key: `字段${r}`, value, path: `${group}.字段${r}`, source: "scale", rawKey: `F${r}` };
            })
        };
    }
    const encoded = encodeNbip(docs, "scale");
    const db = await NbipDatabase.open(new Blob([encoded.bytes]), "scale.nbip");
    check(db.getStats().components === count, `编码 ${count} 个构件成功`);
    check((encoded.bytes.length) > 0, "属性库非空");
    // 全字段校验：随机 200 个构件，每一行的 group/key/value 都要精确一致
    let ok = true;
    let checkedRows = 0;
    for (let i = 0; i < 200; i++) {
        const n = (i * 37) % count;
        const doc = await db.getDocumentByKey(`id_${n}`);
        const expected = docs[`m::id_${n}`];
        if (!doc || doc.rows.length !== expected.rows.length) { ok = false; break; }
        for (let r = 0; r < expected.rows.length; r++) {
            const a = doc.rows[r], b = expected.rows[r];
            checkedRows++;
            if (a.group !== b.group || a.key !== b.key || a.value !== b.value) {
                ok = false;
                console.error(`    不一致: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
                break;
            }
        }
        if (!ok) break;
    }
    check(ok, `随机 200 个构件、${checkedRows || 1600} 行属性全字段精确一致`);
}

async function testFrontPoolEdge() {
    console.log("[5] 字符串池前向编码边界（多字节/空串/超长）");
    const count = 700; // 超过 512，强制启用前缀共享
    const docs: any = {};
    for (let i = 0; i < count; i++) {
        docs[`m::k${i}`] = {
            owner: "m", bimId: `k${i}`, uuid: `u${i}`, name: i % 7 === 0 ? "" : `构件名称${i}`,
            rows: [
                { group: "组", key: "空值", value: "", path: "组.空值", source: "s", rawKey: "E" },
                { group: "组", key: "中文值", value: `中文值_${i}_结尾`, path: "组.中文值", source: "s", rawKey: "C" },
                { group: "Group", key: "Ascii", value: `${"x".repeat(200)}_${i}`, path: "Group.Ascii", source: "s", rawKey: "A" },
                { group: "组", key: "混合", value: `前缀_abc_${i}_中文后缀`, path: "组.混合", source: "s", rawKey: "M" }
            ]
        };
    }
    const encoded = encodeNbip(docs, "边缘值");
    const db = await NbipDatabase.open(new Blob([encoded.bytes]), "edge.nbip");
    const strings = db.getStats().strings;
    check(strings >= 512, `字符串数 ${strings} ≥ 512，已启用前缀共享`);
    let ok = true;
    for (let i = 0; i < count; i += 13) {
        const doc = await db.getDocumentByKey(`k${i}`);
        const expected = docs[`m::k${i}`];
        if (!doc) { ok = false; break; }
        if (doc.name !== expected.name) { ok = false; console.error(`    名称不一致: "${doc.name}" != "${expected.name}"`); break; }
        for (let r = 0; r < expected.rows.length; r++) {
            if (doc.rows[r].value !== expected.rows[r].value) {
                ok = false;
                console.error(`    值不一致: "${doc.rows[r].value}" != "${expected.rows[r].value}"`);
                break;
            }
        }
        if (!ok) break;
    }
    check(ok, "多字节/空串/超长值在前缀共享下全部精确还原");
}

async function testChunkRoundTrip() {
    console.log("[4] 分块索引 delta 往返（无损）");
    // 构造一个非单调索引的几何，确认 delta 编码可精确还原
    const vertCount = 12;
    const position = new Float32Array(vertCount * 3);
    const normal = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
        position[i * 3] = Math.sin(i) * 5.3 + 100;      // 带大偏移量，验证量化原点
        position[i * 3 + 1] = Math.cos(i * 0.7) * 2.1 - 50;
        position[i * 3 + 2] = i * 0.37;
        normal[i * 3] = 0; normal[i * 3 + 1] = 0; normal[i * 3 + 2] = 1;
    }
    const indices = [0, 5, 2, 11, 7, 7, 1, 9, 3, 0, 10, 4, 4, 8, 6];
    const payload = encodeChunkPayloadV11(
        [{ position, normal, index: new Uint32Array(indices) }],
        [{ bimIdIndex: 0, typeIndex: 0, color: 0x336699, matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), geoIdx: 0 }]
    );
    const framed = await frameChunkV11(payload);
    const decoded = await readChunkV11(framed.buffer.slice(framed.byteOffset, framed.byteOffset + framed.byteLength) as ArrayBuffer);
    const g = decoded.geometries[0];
    let indexExact = !!g.index && g.index.length === indices.length;
    for (let i = 0; indexExact && i < indices.length; i++) if (g.index![i] !== indices[i]) indexExact = false;
    check(indexExact, "索引 delta 编码精确还原（含回落/重复值）");
    let posMax = 0;
    for (let i = 0; i < vertCount * 3; i++) posMax = Math.max(posMax, Math.abs(g.position[i] - position[i]));
    check(posMax < 1e-3, `位置量化误差 ${posMax.toExponential(2)} < 1e-3`);
    check(decoded.instances[0].color === 0x336699, "实例颜色往返一致");
}

async function main() {
    await testNbipRoundTrip();
    await testSingleFileEndToEnd();
    await testScale();
    await testChunkRoundTrip();
    await testFrontPoolEdge();
    if (failures > 0) {
        console.error(`\nNBIM v11 自测失败：${failures} 项`);
        process.exit(1);
    }
    console.log("\nNBIM v11 自测全部通过。");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});