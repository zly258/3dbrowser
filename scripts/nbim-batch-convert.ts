/**
 * 批量转换目录下所有旧版 NBIM(v8/v9) → v11 单文件（brotli 编码），输出到目标目录。
 *
 * 关键点：
 *  1) **流式扫描 manifest**：最大的文件 manifest 有 1.09 GB，超过 V8 字符串上限，
 *     直接 JSON.parse 整个 manifest 会抛 "Cannot create a string longer than ..."。
 *     这里用字节级扫描器，只把需要的字段/单条属性文档转成字符串。
 *  2) **增量 NBIP 写入**（NbipWriter）：只保留去重字符串 + 数值型记录，不持有解析后的 JSON。
 *  3) 分块/属性/manifest 全部 brotli 编码（Node zlib 原生），浏览器侧用 wasm 解码。
 *
 * 用法：node scripts/run-nbim-batch-convert.mjs <源目录> <目标目录> [--limit N] [--filter 关键字]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
    encodeChunkPayloadV11,
    type ChunkGeometryInput,
    type ChunkInstanceInput
} from "../src/utils/scene-core/nbimChunk";
import { buildNbim11File, readNbimHeader, readNbimManifest, NBIM11_MAGIC, NBIM11_VERSION } from "../src/utils/scene-core/nbimIO";
import { NbipWriter, NbipDatabase } from "../src/utils/scene-core/nbip";
import { compressInBlocks, BlockCompressedSource } from "../src/utils/scene-core/nbimBlock";
import { frameChunkV11, readChunkV11 } from "../src/utils/scene-manager/nbimExportChunks";

const LEGACY_MAGIC = 0x4d49424e;
const V9_CHUNK_MAGIC = 0x3956424e;

const BROTLI = {
    CHUNK_Q: Number(process.env.BROTLI_CHUNK_Q ?? 11),
    PROP_Q: Number(process.env.BROTLI_PROP_Q ?? 9),
    MANIFEST_Q: Number(process.env.BROTLI_MANIFEST_Q ?? 9)
};

function brCompress(bytes: Uint8Array, quality: number): Uint8Array {
    return new Uint8Array(zlib.brotliCompressSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
            [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength
        }
    }));
}

// ---------------------------------------------------------------- JSON 扫描
const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a, LBRACE = 0x7b, RBRACE = 0x7d, LBRACKET = 0x5b, RBRACKET = 0x5d;

function skipString(buf: Buffer, i: number, end: number): number {
    i++; // opening quote
    while (i < end) {
        const c = buf[i];
        if (c === BACKSLASH) { i += 2; continue; }
        if (c === QUOTE) return i + 1;
        i++;
    }
    return end;
}

function skipValue(buf: Buffer, i: number, end: number): number {
    const c = buf[i];
    if (c === QUOTE) return skipString(buf, i, end);
    if (c === LBRACE || c === LBRACKET) {
        let depth = 0;
        while (i < end) {
            const d = buf[i];
            if (d === QUOTE) { i = skipString(buf, i, end); continue; }
            if (d === LBRACE || d === LBRACKET) { depth++; i++; continue; }
            if (d === RBRACE || d === RBRACKET) { depth--; i++; if (depth === 0) return i; continue; }
            i++;
        }
        return end;
    }
    while (i < end) {
        const d = buf[i];
        if (d === 0x2c || d === RBRACE || d === RBRACKET || d === 0x20 || d === 0x0a || d === 0x0d || d === 0x09) break;
        i++;
    }
    return i;
}

function skipWs(buf: Buffer, i: number, end: number) {
    while (i < end) {
        const c = buf[i];
        if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) i++;
        else break;
    }
    return i;
}

export interface FieldRange { start: number; end: number; }

/** 扫描一个 JSON 对象（buf[start] 必须是 '{'）的一级字段 → 值字节范围。 */
export function scanObjectFields(buf: Buffer, start: number, end: number): Map<string, FieldRange> {
    const fields = new Map<string, FieldRange>();
    let i = skipWs(buf, start, end);
    if (buf[i] !== LBRACE) throw new Error("不是 JSON 对象");
    i++;
    while (i < end) {
        i = skipWs(buf, i, end);
        if (buf[i] === RBRACE) break;
        if (buf[i] === 0x2c) { i++; continue; }
        if (buf[i] !== QUOTE) { i++; continue; }
        const keyEnd = skipString(buf, i, end);
        const key = JSON.parse(buf.toString("utf8", i, keyEnd));
        i = skipWs(buf, keyEnd, end);
        if (buf[i] !== COLON) throw new Error(`字段 ${key} 后缺少 ':'`);
        i = skipWs(buf, i + 1, end);
        const valueStart = i;
        const valueEnd = skipValue(buf, i, end);
        fields.set(key, { start: valueStart, end: valueEnd });
        i = valueEnd;
    }
    return fields;
}

/** 遍历对象的一级键值对（值不做解析），回调收到 key 与值的字节范围。 */
export function forEachObjectEntry(
    buf: Buffer,
    start: number,
    end: number,
    cb: (key: string, valueStart: number, valueEnd: number) => void
): void {
    let i = skipWs(buf, start, end);
    if (buf[i] !== LBRACE) return;
    i++;
    while (i < end) {
        i = skipWs(buf, i, end);
        if (buf[i] === RBRACE) return;
        if (buf[i] === 0x2c) { i++; continue; }
        if (buf[i] !== QUOTE) { i++; continue; }
        const keyEnd = skipString(buf, i, end);
        const key = JSON.parse(buf.toString("utf8", i, keyEnd));
        i = skipWs(buf, keyEnd, end);
        if (buf[i] !== COLON) return;
        i = skipWs(buf, i + 1, end);
        const valueStart = i;
        const valueEnd = skipValue(buf, i, end);
        cb(key, valueStart, valueEnd);
        i = valueEnd;
    }
}

// ---------------------------------------------------------------- v9 分块解码（不依赖 three）
export function decodeV9Chunk(payload: Buffer): { geometries: ChunkGeometryInput[]; instances: ChunkInstanceInput[] } {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let o = 0;
    const geoCount = dv.getUint32(o, true); o += 4;
    const scales = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;
    const offsets = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]; o += 12;

    const geometries: ChunkGeometryInput[] = [];
    for (let g = 0; g < geoCount; g++) {
        const vertCount = dv.getUint32(o, true); o += 4;
        const indexCount = dv.getUint32(o, true); o += 4;
        const indexType = dv.getUint8(o); o += 1;

        const position = new Float32Array(vertCount * 3);
        for (let v = 0; v < vertCount * 3; v++) {
            const q = dv.getInt16(o, true); o += 2;
            position[v] = (q + 32768) * scales[v % 3] + offsets[v % 3];
        }
        const normal = new Int8Array(vertCount * 3);
        normal.set(payload.subarray(o, o + vertCount * 3)); o += vertCount * 3;

        let index: Uint32Array;
        if (indexCount > 0) {
            index = new Uint32Array(indexCount);
            if (indexType === 1) for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint16(o, true); o += 2; }
            else for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint32(o, true); o += 4; }
        } else {
            index = new Uint32Array(vertCount);
            for (let k = 0; k < vertCount; k++) index[k] = k;
        }
        geometries.push({ position, normal, index });
    }

    const instanceCount = dv.getUint32(o, true); o += 4;
    const instances: ChunkInstanceInput[] = [];
    for (let i = 0; i < instanceCount; i++) {
        const bimIdIndex = dv.getUint32(o, true); o += 4;
        const typeIndex = dv.getUint32(o, true); o += 4;
        const color = dv.getUint32(o, true); o += 4;
        const matrix = new Float32Array(16);
        for (let k = 0; k < 16; k++) { matrix[k] = dv.getFloat32(o, true); o += 4; }
        const geoIdx = dv.getUint32(o, true); o += 4;
        instances.push({ bimIdIndex, typeIndex, color, matrix, geoIdx });
    }
    return { geometries, instances };
}

// ---------------------------------------------------------------- 单个文件转换
interface ConvertResult {
    inputBytes: number;
    outputBytes: number;
    chunks: number;
    components: number;
    rows: number;
    strings: number;
    chunkMs: number;
    propMs: number;
    verify: string;
}

export async function convertOne(srcFile: string, dstFile: string): Promise<ConvertResult> {
    const t0 = Date.now();
    const buf = fs.readFileSync(srcFile);
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    if (magic !== LEGACY_MAGIC) throw new Error("不是旧版 NBIM");
    if (version !== 8 && version !== 9) throw new Error(`不支持的旧版版本 ${version}`);

    const manifestEnd = manifestOffset + manifestLength;
    const fields = scanObjectFields(buf, manifestOffset, manifestEnd);
    const small = (name: string) => {
        const r = fields.get(name);
        return r ? JSON.parse(buf.toString("utf8", r.start, r.end)) : undefined;
    };

    const globalBounds = small("globalBounds");
    const stats = small("stats");
    const chunks = small("chunks") || [];
    const structureTree = small("structureTree");
    const bimIdTable: string[] = small("bimIdTable") || [""];
    const bimIdToIndex = new Map<string, number>();
    bimIdTable.forEach((id, idx) => { if (id !== undefined && id !== null && id !== "") bimIdToIndex.set(String(id), idx); });

    // ---- 属性：流式喂给 NbipWriter ----
    const writer = new NbipWriter();
    const docsRange = fields.get("bimPropertyDocs");
    const legacyRange = fields.get("bimProperties");
    if (docsRange) {
        forEachObjectEntry(buf, docsRange.start, docsRange.end, (key, vs, ve) => {
            const doc = JSON.parse(buf.toString("utf8", vs, ve));
            writer.addDocument(key, doc);
        });
    } else if (legacyRange) {
        forEachObjectEntry(buf, legacyRange.start, legacyRange.end, (key, vs, ve) => {
            const value = JSON.parse(buf.toString("utf8", vs, ve));
            const sep = key.indexOf("::");
            const owner = sep > 0 ? key.slice(0, sep) : "";
            const bimId = sep >= 0 ? key.slice(sep + 2) : key;
            writer.addDocument(key, {
                owner,
                bimId,
                uuid: String(value?.uuid || bimId),
                name: String(value?.name || ""),
                rows: [
                    { group: "基本信息", key: "名称", value: String(value?.name || ""), path: "基本信息.名称", source: "legacy", rawKey: "Name" },
                    { group: "基本信息", key: "BIM_ID", value: bimId, path: "基本信息.BIM_ID", source: "legacy", rawKey: "BIM_ID" }
                ]
            });
        });
    }
    const modelStem = path.basename(srcFile, path.extname(srcFile));
    const nbip = writer.finish(modelStem);
    // 释放字符串表内存
    const propertySection = await compressInBlocks(
        nbip.bytes,
        undefined,
        2,
        async (block) => brCompress(block, BROTLI.PROP_Q)
    );

    // ---- 分块 ----
    const chunkBlobs: Uint8Array[] = [];
    const chunkEntries: any[] = [];
    
    const chunkStart = Date.now();
    for (const entry of chunks) {
        const raw = buf.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength);
        if (raw.readUInt32LE(0) !== V9_CHUNK_MAGIC) throw new Error(`分块 ${entry.id} magic 不是 v9`);
        const payloadLength = raw.readUInt32LE(8);
        const compressedLength = raw.readUInt32LE(12);
        const payload = zlib.gunzipSync(raw.subarray(16, 16 + compressedLength));
        if (payload.length !== payloadLength) throw new Error(`分块 ${entry.id} 解压长度不符`);

        const decoded = decodeV9Chunk(payload);

        const v11Payload = encodeChunkPayloadV11(decoded.geometries, decoded.instances);
        const compressed = brCompress(new Uint8Array(v11Payload), BROTLI.CHUNK_Q);
        const framed = await frameChunkV11(v11Payload, 2, compressed);
        chunkBlobs.push(framed);
        chunkEntries.push({
            id: entry.id,
            bounds: entry.bounds,
            originalUuid: entry.originalUuid,
            byteOffset: 0,
            byteLength: framed.byteLength,
            decodedLength: v11Payload.byteLength,
            encoding: NBIM11_VERSION
        });
    }
    const chunkMs = Date.now() - chunkStart;

    const { file } = await buildNbim11File({
        chunkBlobs,
        chunkEntries,
        propertySection,
        propertyInfo: {
            length: propertySection.byteLength,
            components: nbip.stats.components,
            rows: nbip.stats.rows,
            encoding: "block-gzip"
        },
        manifest: { globalBounds, chunks: chunkEntries, stats, structureTree, bimIdTable },
        manifestCodec: 2,
        compressManifest: async (bytes) => brCompress(bytes, BROTLI.MANIFEST_Q)
    });

    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    fs.writeFileSync(dstFile, Buffer.from(file));

    const verify = await verifyOne(dstFile, { chunks: chunkEntries.length, components: nbip.stats.components });
    return {
        inputBytes: buf.length,
        outputBytes: file.byteLength,
        chunks: chunkEntries.length,
        components: nbip.stats.components,
        rows: nbip.stats.rows,
        strings: nbip.stats.strings,
        chunkMs,
        propMs: Date.now() - t0 - chunkMs,
        verify
    };
}

/** 回读校验一个已写出的 v11 文件（分块解码 + 属性库抽样）。 */
export async function verifyOne(dstFile: string, expected?: { chunks?: number; components?: number }): Promise<string> {
    const blob = new Blob([fs.readFileSync(dstFile)]);
    const header = await readNbimHeader(blob);
    if (header.magic !== NBIM11_MAGIC || header.version !== NBIM11_VERSION) throw new Error("回读：文件头不是 v11");
    const manifest: any = await readNbimManifest(blob, header);
    if (expected?.chunks !== undefined && manifest.chunks.length !== expected.chunks) {
        throw new Error(`回读：分块数 ${manifest.chunks.length} != ${expected.chunks}`);
    }
    if (expected?.components !== undefined && manifest.propertyDb?.components !== expected.components) {
        throw new Error(`回读：构件数 ${manifest.propertyDb?.components} != ${expected.components}`);
    }
    let instances = 0;
    for (const idx of [0, manifest.chunks.length - 1]) {
        const c = manifest.chunks[idx];
        const raw = await blob.slice(c.byteOffset, c.byteOffset + c.byteLength).arrayBuffer();
        const decoded = await readChunkV11(raw);
        if (!decoded.geometries.length) throw new Error(`回读：分块 ${idx} 几何为空`);
        if (idx === 0) instances = decoded.instances.length;
    }
    const section = await BlockCompressedSource.open(blob, header.propertyOffset, header.propertyOffset + header.propertyLength);
    const db = await NbipDatabase.open(section, path.basename(dstFile));
    const leaves: any[] = [];
    const walk = (n: any) => { if (!n || leaves.length >= 3) return; if (n.bimId) leaves.push(n); (n.children || []).forEach(walk); };
    walk(manifest.structureTree);
    let sampled = 0;
    for (const leaf of leaves) {
        const doc = await db.getDocumentByKey(String(leaf.bimId));
        if (doc && doc.rows.length > 0) sampled++;
    }
    return `分块 ${manifest.chunks.length} / 构件 ${manifest.propertyDb?.components ?? 0} / 抽样属性 ${sampled}/${leaves.length} / 首块实例 ${instances}`;
}

// ---------------------------------------------------------------- 批量入口
async function main() {
    const args = process.argv.slice(2);
    const srcDir = args[0];
    const dstDir = args[1];
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
    const filterIdx = args.indexOf("--filter");
    const filter = filterIdx >= 0 ? args[filterIdx + 1] : "";

    const files = fs.readdirSync(srcDir)
        .filter((n) => n.toLowerCase().endsWith(".nbim"))
        .filter((n) => !filter || n.includes(filter))
        .map((n) => path.join(srcDir, n))
        .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);

    fs.mkdirSync(dstDir, { recursive: true });
    const logPath = path.join(dstDir, "_convert.log");
    const log = (line: string) => {
        console.log(line);
        fs.appendFileSync(logPath, line + "\n");
    };

    // 仅校验模式：检查目标目录里已有的文件，坏文件删除以便重转
    if (args.includes("--verify-only")) {
        const existing = fs.readdirSync(dstDir).filter((n) => n.toLowerCase().endsWith(".nbim"));
        let ok = 0, bad = 0;
        for (const name of existing) {
            const dst = path.join(dstDir, name);
            try {
                const summary = await verifyOne(dst);
                ok++;
                if (ok % 25 === 0) log(`  已校验 ${ok} 个，最近：${name} ${summary}`);
            } catch (error) {
                bad++;
                log(`[校验失败] ${name}: ${(error as Error).message} → 删除以便重转`);
                try { fs.unlinkSync(dst); } catch { /* ignore */ }
            }
        }
        log(`校验完成：通过 ${ok}，失败并删除 ${bad}`);
        return;
    }

    log(`批量转换 ${files.length} 个文件  ${srcDir} → ${dstDir}`);
    log(`brotli: chunk q=${BROTLI.CHUNK_Q}, prop q=${BROTLI.PROP_Q}, manifest q=${BROTLI.MANIFEST_Q}`);

    let done = 0, skipped = 0, failed = 0, processed = 0;
    let inBytes = 0, outBytes = 0;
    const t0 = Date.now();

    for (let i = 0; i < files.length; i++) {
        const src = files[i];
        const name = path.basename(src);
        const dst = path.join(dstDir, name.replace(/\.nbim$/i, ".nbim"));
        if (processed >= limit) break;
        if (fs.existsSync(dst) && fs.statSync(dst).size > 1024) {
            skipped++;
            processed++;
            continue;
        }
        processed++;
        try {
            const r = await convertOne(src, dst);
            inBytes += r.inputBytes; outBytes += r.outputBytes; done++;
            const ratio = (r.inputBytes / Math.max(1, r.outputBytes)).toFixed(1);
            log(`[${processed}/${files.length}] ${name}  ${(r.inputBytes / 1048576).toFixed(1)} MB → ${(r.outputBytes / 1048576).toFixed(2)} MB  ${ratio}x  分块 ${r.chunks}(chunk ${(r.chunkMs / 1000).toFixed(1)}s, prop ${(r.propMs / 1000).toFixed(1)}s)  ${r.verify}`);
        } catch (error) {
            failed++;
            // 校验失败的文件删除，便于下次重跑
            try { if (fs.existsSync(dst)) fs.unlinkSync(dst); } catch { /* ignore */ }
            log(`[失败] ${name}: ${(error as Error).message}`);
        }
        if (processed % 10 === 0) {
            const elapsed = (Date.now() - t0) / 1000;
            log(`  --- 进度 ${processed}/${files.length}，成功 ${done}，跳过 ${skipped}，失败 ${failed}，用时 ${(elapsed / 60).toFixed(1)} 分钟 ---`);
        }
    }

    const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
    log(`完成：成功 ${done}，跳过 ${skipped}，失败 ${failed}，用时 ${elapsedMin} 分钟`);
    log(`总体积 ${(inBytes / 1073741824).toFixed(2)} GB → ${(outBytes / 1073741824).toFixed(2)} GB（${(inBytes / Math.max(1, outBytes)).toFixed(1)}x）`);
}

// 仅当作为入口脚本运行时才执行（被其它脚本 import 时不要自动跑批量）
const invokedDirectly = !!process.argv[1] && /nbim-batch-convert/.test(process.argv[1]);
if (invokedDirectly) {
    main().catch((error) => { console.error(error); process.exit(1); });
}
