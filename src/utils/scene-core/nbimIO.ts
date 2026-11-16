/**
 * NBIM v11 —— 单文件容器（几何 + 属性 + 结构树全部在一个 .nbim 里）。
 *
 * 文件布局：
 *   [1024B header]
 *   [分块数据 …]                每块 = NBIM v11 量化分块（gzip）
 *   [属性区段 …]                NBIP 数据库，按 256KB 定长块独立 gzip（可随机读）
 *   [manifest …]                JSON（gzip）：结构树 / bimIdTable / 分块表 / 统计
 *
 * header（little-endian）：
 *   0  u32 magic 'NBM1'
 *   4  u32 version 11
 *   8  u32 manifestOffset
 *   12 u32 manifestLength (gzip)
 *   16 u32 propertyOffset
 *   20 u32 propertyLength (block-gzip)
 *   24 u32 flags (bit0 = manifest gzip, bit1 = property block-gzip)
 *   28 u32 reserved
 */
export const NBIM11_MAGIC = 0x314d424e; // bytes 'N','B','M','1'
export const NBIM11_VERSION = 11;
export const NBIM11_HEADER_BYTES = 1024;
export const NBIM11_FLAG_MANIFEST_GZIP = 1;
export const NBIM11_FLAG_PROPERTY_BLOCK = 2;
export const NBIM11_FLAG_MANIFEST_BROTLI = 4;
const MANIFEST_MAX_BYTES = 256 * 1024 * 1024;

import { decompressBytes } from "./codec";

export interface NbimHeader {
    magic: number;
    version: number;
    manifestOffset: number;
    manifestLength: number;
    propertyOffset: number;
    propertyLength: number;
    flags: number;
}

export interface NbimPropertyRow {
    group: string;
    key: string;
    /** 可由 group + key 推导；加载后会释放该字段以省字符串内存 */
    path?: string;
    value: string;
    source?: string;
    rawKey?: string;
}

export interface NbimPropertyDocument {
    owner: string;
    bimId: string;
    uuid: string;
    name: string;
    rows: NbimPropertyRow[];
}

export interface NbimPropertyNameIndexItem {
    group: string;
    key: string;
    path: string;
    rawKey?: string;
    count: number;
}

export interface NbimChunkEntry {
    id: string;
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
    byteOffset: number;
    byteLength: number;
    decodedLength: number;
    encoding: number;
    originalUuid?: string;
}

export interface NbimPropertyDbInfo {
    /** 属性区段在文件内的字节范围 */
    offset: number;
    length: number;
    components: number;
    rows: number;
    encoding: "block-gzip" | "raw";
}

export interface NbimManifest {
    version?: number;
    globalBounds?: {
        min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number };
    };
    chunks?: NbimChunkEntry[];
    structureTree?: any;
    bimIdTable?: string[];
    stats?: { meshes: number; faces: number; memory: number };
    propertyDb?: NbimPropertyDbInfo;
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("当前环境不支持 DecompressionStream(gzip)，无法读取 NBIM v11 manifest");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream === "undefined") {
        throw new Error("当前环境不支持 CompressionStream(gzip)，无法写入 NBIM v11");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readNbimHeader(file: Blob): Promise<NbimHeader> {
    const headerBuffer = await file.slice(0, NBIM11_HEADER_BYTES).arrayBuffer();
    const dv = new DataView(headerBuffer);
    return {
        magic: dv.getUint32(0, true),
        version: dv.getUint32(4, true),
        manifestOffset: dv.getUint32(8, true),
        manifestLength: dv.getUint32(12, true),
        propertyOffset: dv.getUint32(16, true),
        propertyLength: dv.getUint32(20, true),
        flags: dv.getUint32(24, true)
    };
}

export async function readNbimManifest(file: Blob, header: NbimHeader): Promise<NbimManifest> {
    if (header.manifestLength <= 0 || header.manifestLength > MANIFEST_MAX_BYTES) {
        throw new Error(`NBIM manifest 长度异常: ${header.manifestLength}`);
    }
    const raw = new Uint8Array(
        await file.slice(header.manifestOffset, header.manifestOffset + header.manifestLength).arrayBuffer()
    );
    let bytes = raw;
    if (header.flags & NBIM11_FLAG_MANIFEST_BROTLI) bytes = await decompressBytes(raw, 2);
    else if (header.flags & NBIM11_FLAG_MANIFEST_GZIP) bytes = await decompressBytes(raw, 1);
    return JSON.parse(new TextDecoder().decode(bytes)) as NbimManifest;
}

/** 组装 v11 单文件：header + 分块 + 属性区段 + 压缩后的 manifest。 */
export async function buildNbim11File(options: {
    chunkBlobs: Uint8Array[];
    chunkEntries: NbimChunkEntry[];
    propertySection: Uint8Array;
    propertyInfo: Omit<NbimPropertyDbInfo, "offset">;
    manifest: Omit<NbimManifest, "propertyDb"> & { propertyDb?: never };
    /** 1 = gzip（浏览器导出默认），2 = brotli（Node 迁移用） */
    manifestCodec?: number;
    compressManifest?: (bytes: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ file: Uint8Array; manifestOffset: number; propertyOffset: number }> {
    const { chunkBlobs, chunkEntries, propertySection, propertyInfo, manifest } = options;
    const manifestCodec = options.manifestCodec ?? 1;

    const propertyOffset = NBIM11_HEADER_BYTES + chunkBlobs.reduce((sum, blob) => sum + blob.byteLength, 0);
    // 先按实际排布写好每个分块的偏移，再序列化 manifest（manifest 就是 chunkEntries 的同一个数组）。
    let cursor = NBIM11_HEADER_BYTES;
    for (let i = 0; i < chunkBlobs.length; i++) {
        const blob = chunkBlobs[i];
        chunkEntries[i].byteOffset = cursor;
        chunkEntries[i].byteLength = blob.byteLength;
        chunkEntries[i].encoding = NBIM11_VERSION;
        cursor += blob.byteLength;
    }
    const manifestOffset = propertyOffset + propertySection.byteLength;

    const fullManifest = {
        ...manifest,
        version: NBIM11_VERSION,
        propertyDb: { ...propertyInfo, offset: propertyOffset, length: propertySection.byteLength }
    } as NbimManifest;

    const manifestBytes = options.compressManifest
        ? await options.compressManifest(new TextEncoder().encode(JSON.stringify(fullManifest)))
        : await gzipBytes(new TextEncoder().encode(JSON.stringify(fullManifest)));
    const manifestFlag = manifestCodec === 2 ? NBIM11_FLAG_MANIFEST_BROTLI : NBIM11_FLAG_MANIFEST_GZIP;
    const total = manifestOffset + manifestBytes.byteLength;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);

    dv.setUint32(0, NBIM11_MAGIC, true);
    dv.setUint32(4, NBIM11_VERSION, true);
    dv.setUint32(8, manifestOffset, true);
    dv.setUint32(12, manifestBytes.byteLength, true);
    dv.setUint32(16, propertyOffset, true);
    dv.setUint32(20, propertySection.byteLength, true);
    dv.setUint32(24, manifestFlag | NBIM11_FLAG_PROPERTY_BLOCK, true);

    let writeCursor = NBIM11_HEADER_BYTES;
    for (const blob of chunkBlobs) {
        out.set(blob, writeCursor);
        writeCursor += blob.byteLength;
    }
    out.set(propertySection, propertyOffset);
    out.set(manifestBytes, manifestOffset);

    return { file: out, manifestOffset, propertyOffset };
}