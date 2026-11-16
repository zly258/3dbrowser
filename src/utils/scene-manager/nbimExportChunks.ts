import type * as THREE from "three";
import type { NbimChunkEntry } from "../scene-core/nbimIO";
import {
    encodeChunkPayloadV11,
    decodeChunkPayloadV11,
    NBIM11_CHUNK_MAGIC,
    chunkCodecFromMagic,
    chunkMagicForCodec,
    CHUNK_PAYLOAD_FORMAT_DELTA_INDEX,
    type ChunkGeometryInput,
    type ChunkInstanceInput,
    type DecodedChunk
} from "../scene-core/nbimChunk";
import { decompressBytes, compressBytes } from "../scene-core/codec";

/**
 * NBIM v11 分块导出 / 解码工具（几何量化 + 外壳压缩）。
 */

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressChunkPayload(compressed: Uint8Array, codec: number): Promise<Uint8Array> {
    return decompressBytes(compressed, codec);
}

/** 由若干 (geometry + 实例) 生成 v11 未压缩负载。 */
export function buildChunkPayloadV11(
    items: any[],
    bimIdToIndex: Map<string, number>,
    resolveBimId?: (item: any) => string | undefined
): ArrayBuffer {
    const geoMap = new Map<THREE.BufferGeometry, number>();
    const geometries: ChunkGeometryInput[] = [];

    for (const item of items) {
        const geometry = item.geometry as THREE.BufferGeometry | undefined;
        if (!geometry || geoMap.has(geometry)) continue;
        geoMap.set(geometry, geometries.length);
        const position = geometry.getAttribute("position");
        const normal = geometry.getAttribute("normal");
        const index = geometry.index;
        geometries.push({
            position: position.array as Float32Array,
            normal: normal ? (normal.array as Float32Array) : null,
            index: index ? (index.array as Uint32Array | Uint16Array) : null
        });
    }

    const instances: ChunkInstanceInput[] = items.map((item, i) => {
        const bimId = resolveBimId?.(item) || item.bimId || item.uuid;
        const geometry = item.geometry as THREE.BufferGeometry | undefined;
        return {
            bimIdIndex: bimIdToIndex.get(String(bimId)) ?? 0,
            typeIndex: typeof item.typeIndex === "number" ? item.typeIndex : 0,
            color: Number(item.color) || 0,
            matrix: item.matrix?.elements ?? IDENTITY,
            geoIdx: geometry ? (geoMap.get(geometry) ?? 0) : 0
        };
    });

    return encodeChunkPayloadV11(geometries, instances);
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** 给负载加 16B 头并压缩，得到落盘分块。
 *  codec：1=gzip，2=brotli（按 resolveExportCodec 决定）。 */
export async function frameChunkV11(payload: ArrayBuffer, codec = 1, compressedOverride?: Uint8Array): Promise<Uint8Array> {
    const rawBytes = new Uint8Array(payload);
    const compressed = compressedOverride ?? (codec === 2
        ? await compressBytes(rawBytes, 2, 11)
        : await gzip(rawBytes));
    const out = new Uint8Array(16 + compressed.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, chunkMagicForCodec(codec), true);
    dv.setUint32(4, CHUNK_PAYLOAD_FORMAT_DELTA_INDEX, true);
    dv.setUint32(8, rawBytes.length, true);
    dv.setUint32(12, compressed.length, true);
    out.set(compressed, 16);
    return out;
}

/** 读一个 v11 分块 → 解码后的几何/实例。外壳 magic 决定压缩方式（gzip / brotli）。 */
export async function readChunkV11(chunk: ArrayBuffer): Promise<DecodedChunk> {
    const dv = new DataView(chunk);
    const magic = dv.getUint32(0, true);
    const codec = chunkCodecFromMagic(magic);
    if (codec < 0) throw new Error("无效的 NBIM v11 分块");
    const payloadFormat = dv.getUint32(4, true);
    const payloadLength = dv.getUint32(8, true);
    const compressedLength = dv.getUint32(12, true);
    if (chunk.byteLength < 16 + compressedLength) throw new Error("NBIM v11 分块长度不足");
    const compressed = new Uint8Array(chunk, 16, compressedLength);
    const payload = await decompressBytes(compressed, codec);
    if (payload.byteLength !== payloadLength) {
        throw new Error(`NBIM v11 解压长度不符: ${payload.byteLength} != ${payloadLength}`);
    }
    const payloadBuffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
    return decodeChunkPayloadV11(payloadBuffer, payloadFormat);
}

/**
 * 从当前场景生成 v11 分块数组。
 * - 内存里是未编码的分块（chunk.node）→ 直接量化编码；
 * - 来自已加载 v11 文件的分块 → 解码后按新的 bimId 表重新编码。
 */
export async function prepareNbimExportChunksV11(options: {
    chunks: any[];
    nbimFiles: Map<string, File>;
    nbimMeta: Map<string, { version: number; bimIdTable?: string[] }>;
    bimIdToIndex: Map<string, number>;
    hasValidChunkBinaryRange: (chunk: any) => boolean;
    /** 1 = gzip，2 = brotli（默认 gzip） */
    codec?: number;
}): Promise<{ chunkBlobs: Uint8Array[]; exportChunks: NbimChunkEntry[] }> {
    const { chunks, nbimFiles, nbimMeta, bimIdToIndex, hasValidChunkBinaryRange } = options;
    const codec = options.codec ?? 1;
    const chunkBlobs: Uint8Array[] = [];
    const exportChunks: NbimChunkEntry[] = [];

    for (const chunk of chunks) {
        let payload: ArrayBuffer | null = null;

        if (chunk.node) {
            payload = buildChunkPayloadV11(chunk.node.items, bimIdToIndex);
        } else if (chunk.nbimFileId && nbimFiles.has(chunk.nbimFileId) && hasValidChunkBinaryRange(chunk)) {
            const file = nbimFiles.get(chunk.nbimFileId)!;
            const meta = nbimMeta.get(chunk.nbimFileId);
            if ((meta?.version ?? 11) !== 11) {
                throw new Error(`不支持的 NBIM 版本: ${meta?.version}（仅支持 v11）`);
            }
            const encoded = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
            const decoded = await readChunkV11(encoded);
            const oldTable = meta?.bimIdTable || [];
            const instances: ChunkInstanceInput[] = decoded.instances.map((inst) => ({
                ...inst,
                bimIdIndex: bimIdToIndex.get(String(oldTable[inst.bimIdIndex] ?? "")) ?? 0
            }));
            payload = encodeChunkPayloadV11(decoded.geometries as ChunkGeometryInput[], instances);
        }

        if (!payload) continue;
        const framed = await frameChunkV11(payload, codec);
        chunkBlobs.push(framed);
        exportChunks.push({
            id: chunk.id,
            bounds: {
                min: { x: chunk.bounds.min.x, y: chunk.bounds.min.y, z: chunk.bounds.min.z },
                max: { x: chunk.bounds.max.x, y: chunk.bounds.max.y, z: chunk.bounds.max.z }
            },
            originalUuid: chunk.originalUuid ? String(chunk.originalUuid) : undefined,
            byteOffset: 0,
            byteLength: framed.byteLength,
            decodedLength: payload.byteLength,
            encoding: 11
        });
    }

    return { chunkBlobs, exportChunks };
}