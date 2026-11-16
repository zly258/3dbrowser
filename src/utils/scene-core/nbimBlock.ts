/**
 * NBIM v11 单文件容器的通用字节源与“分块压缩”工具。
 *
 * 为什么需要 ByteSource：属性库在容器里是分块 gzip 的，随机读一个构件的几十行
 * 只需要解压 1~2 个块；用一个和 Blob 同形的接口就能让 NbipDatabase 完全不感知压缩。
 *
 * 分块压缩格式（'NBB1'）：
 *   u32 magic / u32 version / u32 blockSize / u32 blockCount / u32 unmatchedTotal
 *   [blockCount × {u32 offset, u32 compressedLength, u32 uncompressedLength}]
 *   块数据（每块独立 deflate）
 */
import { decompressBytes } from "./codec";

export const NBIM_BLOCK_MAGIC = 0x3142424e; // bytes 'N','B','B','1' —— gzip 块
export const NBIM_BLOCK_MAGIC_BROTLI = 0x3342424e; // bytes 'N','B','B','3' —— brotli 块
export const NBIM_BLOCK_VERSION = 11;
const BLOCK_HEADER_BYTES = 20;
const BLOCK_ENTRY_BYTES = 12;
/**
 * 属性区段的块大小：64 KB。
 * 实测：64 KB 相比 256 KB 属性体积只 +1.8%，但单次属性读取只解压 64 KB（≈1/4 延迟）。
 */
export const DEFAULT_BLOCK_SIZE = 64 * 1024;

/** 与 Blob 同形的最小字节源（Blob 天然满足该接口）。 */
export interface ByteRangeLike {
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
}

export interface ByteSourceLike {
    slice(start: number, end: number): ByteRangeLike;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream === "undefined") {
        throw new Error("当前环境不支持 CompressionStream(gzip)");
    }
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 把一段字节做“定长块 + 每块独立压缩”，返回整个分块压缩区段。
 *  codec 1 = gzip（浏览器默认），2 = brotli；compress 可覆盖（Node 侧用 zlib 的 brotli）。 */
export async function compressInBlocks(
    source: Uint8Array,
    blockSize = DEFAULT_BLOCK_SIZE,
    codec = 1,
    compress?: (bytes: Uint8Array) => Promise<Uint8Array>
): Promise<Uint8Array> {
    const compressFn = compress ?? gzip;
    const blockCount = Math.max(1, Math.ceil(source.byteLength / blockSize));
    const compressedBlocks: Uint8Array[] = [];
    for (let i = 0; i < blockCount; i++) {
        const start = i * blockSize;
        const end = Math.min(source.byteLength, start + blockSize);
        compressedBlocks.push(await compressFn(source.subarray(start, end)));
    }

    const indexBytes = BLOCK_HEADER_BYTES + blockCount * BLOCK_ENTRY_BYTES;
    let total = indexBytes;
    for (const block of compressedBlocks) total += block.byteLength;

    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, codec === 2 ? NBIM_BLOCK_MAGIC_BROTLI : NBIM_BLOCK_MAGIC, true);
    dv.setUint32(4, NBIM_BLOCK_VERSION, true);
    dv.setUint32(8, blockSize, true);
    dv.setUint32(12, blockCount, true);
    dv.setUint32(16, source.byteLength, true);

    let cursor = indexBytes;
    for (let i = 0; i < blockCount; i++) {
        const block = compressedBlocks[i];
        const entry = BLOCK_HEADER_BYTES + i * BLOCK_ENTRY_BYTES;
        const srcStart = i * blockSize;
        const srcEnd = Math.min(source.byteLength, srcStart + blockSize);
        dv.setUint32(entry, cursor, true);
        dv.setUint32(entry + 4, block.byteLength, true);
        dv.setUint32(entry + 8, srcEnd - srcStart, true);
        out.set(block, cursor);
        cursor += block.byteLength;
    }
    return out;
}

export interface BlockCompressedMeta {
    blockSize: number;
    blockCount: number;
    uncompressedLength: number;
    codec: number;
    entries: Array<{ offset: number; compressedLength: number; uncompressedLength: number }>;
}

export async function readBlockCompressedMeta(
    source: ByteSourceLike,
    start: number,
    end: number
): Promise<BlockCompressedMeta> {
    const head = await source.slice(start, Math.min(end, start + BLOCK_HEADER_BYTES)).arrayBuffer();
    const dv = new DataView(head);
    const magic = dv.getUint32(0, true);
    const codec = magic === NBIM_BLOCK_MAGIC_BROTLI ? 2 : magic === NBIM_BLOCK_MAGIC ? 1 : -1;
    if (codec < 0) throw new Error("不是有效的分块压缩区段（magic 不匹配）");
    const version = dv.getUint32(4, true);
    if (version !== NBIM_BLOCK_VERSION) throw new Error(`不支持的分块压缩版本: ${version}`);
    const blockSize = dv.getUint32(8, true);
    const blockCount = dv.getUint32(12, true);
    const uncompressedLength = dv.getUint32(16, true);

    const indexStart = start + BLOCK_HEADER_BYTES;
    const indexEnd = Math.min(end, indexStart + blockCount * BLOCK_ENTRY_BYTES);
    const indexBuffer = await source.slice(indexStart, indexEnd).arrayBuffer();
    const idv = new DataView(indexBuffer);
    const entries: BlockCompressedMeta["entries"] = [];
    for (let i = 0; i < blockCount; i++) {
        const base = i * BLOCK_ENTRY_BYTES;
        entries.push({
            offset: idv.getUint32(base, true),
            compressedLength: idv.getUint32(base + 4, true),
            uncompressedLength: idv.getUint32(base + 8, true)
        });
    }
    return { blockSize, blockCount, uncompressedLength, codec, entries };
}

/** 一个“看起来像 Blob”的分块压缩字节源：随机读取时按需解压并缓存少量块。 */
export class BlockCompressedSource implements ByteSourceLike {
    private readonly source: ByteSourceLike;
    private readonly sectionStart: number;
    private readonly meta: BlockCompressedMeta;
    private readonly cache = new Map<number, Uint8Array>();
    private readonly maxCachedBlocks: number;

    private constructor(source: ByteSourceLike, sectionStart: number, meta: BlockCompressedMeta) {
        this.source = source;
        this.sectionStart = sectionStart;
        this.meta = meta;
        // 属性区段用 64 KB 小块（单块解压快），但一个构件的多个字符串会散落在不同块里，
        // 随机读时需要更多块缓存才能命中。64 块 ≈ 4 MB，实测能把大库单构件读取从 ~9 ms 拉回 ~1 ms。
        this.maxCachedBlocks = 128;
    }

    static async open(
        source: ByteSourceLike,
        start: number,
        end: number
    ): Promise<BlockCompressedSource> {
        const meta = await readBlockCompressedMeta(source, start, end);
        return new BlockCompressedSource(source, start, meta);
    }

    get length(): number {
        return this.meta.uncompressedLength;
    }

    private async loadBlock(index: number): Promise<Uint8Array> {
        const cached = this.cache.get(index);
        if (cached) {
            // LRU touch
            this.cache.delete(index);
            this.cache.set(index, cached);
            return cached;
        }
        const entry = this.meta.entries[index];
        if (!entry) throw new Error(`属性库块索引越界: ${index}`);
        const dataStart = this.sectionStart + entry.offset;
        const compressed = new Uint8Array(
            await this.source.slice(dataStart, dataStart + entry.compressedLength).arrayBuffer()
        );
        const block = await decompressBytes(compressed, this.meta.codec);
        if (block.byteLength !== entry.uncompressedLength) {
            throw new Error(`属性库块 ${index} 解压长度不符: ${block.byteLength} != ${entry.uncompressedLength}`);
        }
        this.cache.set(index, block);
        while (this.cache.size > this.maxCachedBlocks) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
        return block;
    }

    slice(start: number, end: number): ByteRangeLike {
        const from = Math.max(0, Math.min(start, this.meta.uncompressedLength));
        const to = Math.max(from, Math.min(end, this.meta.uncompressedLength));
        const self = this;
        return {
            async arrayBuffer(): Promise<ArrayBuffer> {
                if (to <= from) return new ArrayBuffer(0);
                const firstBlock = Math.floor(from / self.meta.blockSize);
                const lastBlock = Math.floor((to - 1) / self.meta.blockSize);
                const blockBytes = await Promise.all(
                    Array.from({ length: lastBlock - firstBlock + 1 }, (_, i) => self.loadBlock(firstBlock + i))
                );
                const total = blockBytes.reduce((sum, block) => sum + block.byteLength, 0);
                const merged = new Uint8Array(total);
                let cursor = 0;
                for (const block of blockBytes) {
                    merged.set(block, cursor);
                    cursor += block.byteLength;
                }
                const sliceStart = from - firstBlock * self.meta.blockSize;
                const sliceEnd = sliceStart + (to - from);
                const out = merged.subarray(sliceStart, sliceEnd);
                return out.slice().buffer;
            },
            async text(): Promise<string> {
                return new TextDecoder().decode(await this.arrayBuffer());
            }
        };
    }
}
