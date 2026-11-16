/**
 * NBIM v11 分块编解码：几何量化（int16 位置 / int8 法线 / u16·u32 索引）+ gzip。
 *
 * 对比 v10（float32 位置 12B + float32 法线 12B + uint32 索引 4B，每顶点 28B）：
 *   v11 每顶点 = 位置 6B + 法线 3B + 索引 2B（可用 u16 时）≈ 11B，**约 2.5 倍**。
 * 位置按“单几何局部包围盒”线性量化到 u16（精度 = 包围盒跨度/65535），
 * 法线直接 i8 归一化（运行时 three 的 normalized 属性原样还原）。
 *
 * 纯数据层：不 import three，浏览器主线程与 Worker 共用。
 */
export const NBIM11_CHUNK_MAGIC = 0x3156424e; // bytes 'N','B','V','1' —— gzip 负载
export const NBIM11_CHUNK_MAGIC_BROTLI = 0x3356424e; // bytes 'N','B','V','3' —— brotli 负载
export const NBIM11_CHUNK_VERSION = 11;

/** 分块外壳 magic → 区段编码（见 codec.ts）。 */
export function chunkCodecFromMagic(magic: number): number {
    if (magic === NBIM11_CHUNK_MAGIC) return 1; // CODEC_GZIP
    if (magic === NBIM11_CHUNK_MAGIC_BROTLI) return 2; // CODEC_BROTLI
    return -1;
}

export function chunkMagicForCodec(codec: number): number {
    return codec === 2 ? NBIM11_CHUNK_MAGIC_BROTLI : NBIM11_CHUNK_MAGIC;
}

/**
 * 16B 分块头里的“负载格式”字段（偏移 4）。
 * 0 = 原始 u16/u32 索引；2 = 索引做 delta（前缀差分）编码，解码时前缀求和还原。
 * 实测 delta 让索引 gzip 后小 26~36%（索引占几何一半）。
 */
export const CHUNK_PAYLOAD_FORMAT_PLAIN = 0;
export const CHUNK_PAYLOAD_FORMAT_DELTA_INDEX = 2;

const INDEX_NONE = 0;
const INDEX_U16 = 1;
const INDEX_U32 = 2;

const FLAG_HAS_NORMAL = 1;

export interface ChunkGeometryInput {
    position: Float32Array | Float64Array;
    /** Float32（-1..1）或已量化的 Int8 */
    normal?: Float32Array | Int8Array | null;
    index?: Uint32Array | Uint16Array | null;
}

export interface ChunkInstanceInput {
    bimIdIndex: number;
    typeIndex: number;
    color: number;
    matrix: ArrayLike<number>;
    geoIdx: number;
}

export interface DecodedChunkGeometry {
    position: Float32Array;
    normal: Int8Array;
    index: Uint32Array | null;
    /** [minX,minY,minZ,maxX,maxY,maxZ] */
    box: Float32Array;
}

export interface DecodedChunk {
    geometries: DecodedChunkGeometry[];
    instances: ChunkInstanceInput[];
}

/** 每个几何的量化参数。 */
interface GeometryPlan {
    vertCount: number;
    indexCount: number;
    indexType: number;
    hasNormal: boolean;
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
    scaleX: number; scaleY: number; scaleZ: number;
    positionsBytes: number;
    normalsBytes: number;
    indicesBytes: number;
}

function planGeometry(geometry: ChunkGeometryInput): GeometryPlan {
    const position = geometry.position;
    const vertCount = Math.floor(position.length / 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertCount; i++) {
        const x = position[i * 3];
        const y = position[i * 3 + 1];
        const z = position[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0; }
    const spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;
    const scaleX = spanX > 0 ? spanX / 65535 : 0;
    const scaleY = spanY > 0 ? spanY / 65535 : 0;
    const scaleZ = spanZ > 0 ? spanZ / 65535 : 0;

    const index = geometry.index;
    const indexCount = index ? index.length : 0;
    let indexType = INDEX_NONE;
    let indicesBytes = 0;
    if (indexCount > 0) {
        // 顶点数 ≤ 65536 时索引值必然 ≤ 65535，可用 u16
        indexType = vertCount <= 65536 ? INDEX_U16 : INDEX_U32;
        indicesBytes = indexCount * (indexType === INDEX_U16 ? 2 : 4);
    }

    return {
        vertCount,
        indexCount,
        indexType,
        hasNormal: !!geometry.normal,
        minX, minY, minZ, maxX, maxY, maxZ,
        scaleX, scaleY, scaleZ,
        positionsBytes: vertCount * 6,
        normalsBytes: geometry.normal ? vertCount * 3 : 0,
        indicesBytes
    };
}

const GEOMETRY_HEADER_BYTES = 4 + 4 + 1 + 1 + 2 + 24; // 36

/** 编码单个分块的 v11 负载（未压缩）。索引按差分写入（配合 CHUNK_PAYLOAD_FORMAT_DELTA_INDEX）。 */
export function encodeChunkPayloadV11(
    geometries: ChunkGeometryInput[],
    instances: ChunkInstanceInput[]
): ArrayBuffer {    const plans = geometries.map(planGeometry);

    let size = 4;
    for (const plan of plans) {
        size += GEOMETRY_HEADER_BYTES + plan.positionsBytes + plan.normalsBytes + plan.indicesBytes;
    }
    size += 4 + instances.length * 80;

    const buffer = new ArrayBuffer(size);
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    dv.setUint32(offset, geometries.length, true); offset += 4;

    for (let gi = 0; gi < geometries.length; gi++) {
        const plan = plans[gi];
        const geometry = geometries[gi];

        dv.setUint32(offset, plan.vertCount, true); offset += 4;
        dv.setUint32(offset, plan.indexCount, true); offset += 4;
        dv.setUint8(offset, plan.indexType); offset += 1;
        dv.setUint8(offset, plan.hasNormal ? FLAG_HAS_NORMAL : 0); offset += 1;
        dv.setUint16(offset, 0, true); offset += 2;
        dv.setFloat32(offset, plan.minX, true); offset += 4;
        dv.setFloat32(offset, plan.minY, true); offset += 4;
        dv.setFloat32(offset, plan.minZ, true); offset += 4;
        dv.setFloat32(offset, plan.maxX, true); offset += 4;
        dv.setFloat32(offset, plan.maxY, true); offset += 4;
        dv.setFloat32(offset, plan.maxZ, true); offset += 4;

        // 位置：u16 线性量化
        const position = geometry.position;
        const invX = plan.scaleX > 0 ? 1 / plan.scaleX : 0;
        const invY = plan.scaleY > 0 ? 1 / plan.scaleY : 0;
        const invZ = plan.scaleZ > 0 ? 1 / plan.scaleZ : 0;
        for (let i = 0; i < plan.vertCount; i++) {
            const x = Math.round((position[i * 3] - plan.minX) * invX);
            const y = Math.round((position[i * 3 + 1] - plan.minY) * invY);
            const z = Math.round((position[i * 3 + 2] - plan.minZ) * invZ);
            dv.setUint16(offset, x < 0 ? 0 : x > 65535 ? 65535 : x, true); offset += 2;
            dv.setUint16(offset, y < 0 ? 0 : y > 65535 ? 65535 : y, true); offset += 2;
            dv.setUint16(offset, z < 0 ? 0 : z > 65535 ? 65535 : z, true); offset += 2;
        }

        // 法线：i8 归一化
        if (plan.hasNormal) {
            const normal = geometry.normal!;
            if (normal instanceof Int8Array) {
                bytes.set(normal.subarray(0, plan.vertCount * 3), offset);
                offset += plan.normalsBytes;
            } else {
                for (let i = 0; i < plan.vertCount * 3; i++) {
                    const v = normal[i];
                    const q = Math.round((v > 1 ? 1 : v < -1 ? -1 : v) * 127);
                    dv.setInt8(offset, q < -127 ? -127 : q > 127 ? 127 : q); offset += 1;
                }
            }
        }

        // 索引：写入 delta（差分）序列，gzip 后显著更小
        if (plan.indexType !== INDEX_NONE) {
            const index = geometry.index!;
            const mask = plan.indexType === INDEX_U16 ? 0xffff : 0xffffffff;
            let prev = 0;
            if (plan.indexType === INDEX_U16) {
                for (let i = 0; i < plan.indexCount; i++) {
                    const cur = index[i] & 0xffff;
                    dv.setUint16(offset, (cur - prev) & mask, true); offset += 2;
                    prev = cur;
                }
            } else {
                for (let i = 0; i < plan.indexCount; i++) {
                    const cur = index[i] >>> 0;
                    dv.setUint32(offset, (cur - prev) >>> 0, true); offset += 4;
                    prev = cur;
                }
            }
        }
    }

    dv.setUint32(offset, instances.length, true); offset += 4;
    for (const instance of instances) {
        dv.setUint32(offset, instance.bimIdIndex, true); offset += 4;
        dv.setUint32(offset, instance.typeIndex, true); offset += 4;
        dv.setUint32(offset, instance.color, true); offset += 4;
        const matrix = instance.matrix;
        for (let k = 0; k < 16; k++) {
            dv.setFloat32(offset, matrix[k] || 0, true); offset += 4;
        }
        dv.setUint32(offset, instance.geoIdx, true); offset += 4;
    }

    return buffer;
}

/** 解码 v11 负载（不含 gzip 外壳）。payloadFormat 见 CHUNK_PAYLOAD_FORMAT_*。 */
export function decodeChunkPayloadV11(
    payload: ArrayBuffer,
    payloadFormat: number = CHUNK_PAYLOAD_FORMAT_DELTA_INDEX
): DecodedChunk {
    const deltaIndex = payloadFormat === CHUNK_PAYLOAD_FORMAT_DELTA_INDEX;
    const dv = new DataView(payload);
    const bytes = new Uint8Array(payload);
    let offset = 0;

    const geometryCount = dv.getUint32(offset, true); offset += 4;
    const geometries: DecodedChunkGeometry[] = [];

    for (let gi = 0; gi < geometryCount; gi++) {
        const vertCount = dv.getUint32(offset, true); offset += 4;
        const indexCount = dv.getUint32(offset, true); offset += 4;
        const indexType = dv.getUint8(offset); offset += 1;
        const flags = dv.getUint8(offset); offset += 1;
        offset += 2; // reserved
        const minX = dv.getFloat32(offset, true); offset += 4;
        const minY = dv.getFloat32(offset, true); offset += 4;
        const minZ = dv.getFloat32(offset, true); offset += 4;
        const maxX = dv.getFloat32(offset, true); offset += 4;
        const maxY = dv.getFloat32(offset, true); offset += 4;
        const maxZ = dv.getFloat32(offset, true); offset += 4;

        const scaleX = maxX - minX > 0 ? (maxX - minX) / 65535 : 0;
        const scaleY = maxY - minY > 0 ? (maxY - minY) / 65535 : 0;
        const scaleZ = maxZ - minZ > 0 ? (maxZ - minZ) / 65535 : 0;

        const position = new Float32Array(vertCount * 3);
        for (let i = 0; i < vertCount; i++) {
            position[i * 3] = minX + dv.getUint16(offset, true) * scaleX; offset += 2;
            position[i * 3 + 1] = minY + dv.getUint16(offset, true) * scaleY; offset += 2;
            position[i * 3 + 2] = minZ + dv.getUint16(offset, true) * scaleZ; offset += 2;
        }

        let normal: Int8Array;
        if (flags & FLAG_HAS_NORMAL) {
            normal = new Int8Array(vertCount * 3);
            normal.set(bytes.subarray(offset, offset + vertCount * 3));
            offset += vertCount * 3;
        } else {
            normal = new Int8Array(vertCount * 3);
        }

        let index: Uint32Array | null = null;
        if (indexType === INDEX_U16) {
            index = new Uint32Array(indexCount);
            let prev = 0;
            for (let i = 0; i < indexCount; i++) {
                const raw = dv.getUint16(offset, true); offset += 2;
                if (deltaIndex) {
                    prev = (prev + raw) & 0xffff;
                    index[i] = prev;
                } else {
                    index[i] = raw;
                }
            }
        } else if (indexType === INDEX_U32) {
            index = new Uint32Array(indexCount);
            let prev = 0;
            for (let i = 0; i < indexCount; i++) {
                const raw = dv.getUint32(offset, true); offset += 4;
                if (deltaIndex) {
                    prev = (prev + raw) >>> 0;
                    index[i] = prev;
                } else {
                    index[i] = raw;
                }
            }
        }

        geometries.push({
            position,
            normal,
            index,
            box: new Float32Array([minX, minY, minZ, maxX, maxY, maxZ])
        });
    }

    const instanceCount = dv.getUint32(offset, true); offset += 4;
    const instances: ChunkInstanceInput[] = [];
    for (let i = 0; i < instanceCount; i++) {
        const bimIdIndex = dv.getUint32(offset, true); offset += 4;
        const typeIndex = dv.getUint32(offset, true); offset += 4;
        const color = dv.getUint32(offset, true); offset += 4;
        const matrix = new Float32Array(16);
        for (let k = 0; k < 16; k++) { matrix[k] = dv.getFloat32(offset, true); offset += 4; }
        const geoIdx = dv.getUint32(offset, true); offset += 4;
        instances.push({ bimIdIndex, typeIndex, color, matrix, geoIdx });
    }

    return { geometries, instances };
}