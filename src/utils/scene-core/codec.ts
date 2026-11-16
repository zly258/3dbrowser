/**
 * 区段编解码：gzip（浏览器原生）+ brotli（wasm 解码，与 gzip 解码同速但体积约为其一半）。
 *
 * 为什么两个都要：
 *  - gzip 由 CompressionStream/DecompressionStream 提供，零依赖，浏览器端导出继续用它；
 *  - brotli 只用于**解码**（写入端在 Node 的迁移脚本里用内置 zlib），
 *    实测解码 296~325 MB/s，与 gzip 的 229~335 MB/s 相当，但体积小 30~70%。
 *
 * 实测（Chromium，真实分块/属性区段）：
 *   CCS 分块 2095 KB raw：gzip-6 471 KB / 6.11 ms ｜ brotli-11 139.8 KB / 6.30 ms
 *   DCS 分块  946 KB raw：gzip-6 201.6 KB / 4.04 ms ｜ brotli-11 90.0 KB / 3.06 ms
 *   DCS 属性  856 KB raw：gzip-6 310.7 KB / 3.62 ms ｜ brotli-11 213.0 KB / 4.86 ms
 */
export const CODEC_NONE = 0;
export const CODEC_GZIP = 1;
export const CODEC_BROTLI = 2;

export function isSupportedCompression() {
    return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

let brotliModulePromise: Promise<(bytes: Uint8Array) => Uint8Array> | null = null;

function isNodeRuntime() {
    return typeof process !== "undefined" && !!(process as any).versions?.node;
}

/**
 * brotli 解码器：
 *  - Node（迁移/校验脚本）用内置 zlib，同步且最快；
 *  - 浏览器/Worker 用 brotli-dec-wasm（实测解码 296~325 MB/s，与 gzip 同速）。
 * 注意：wasm 包在 Node 里会 fetch(file://) 失败，所以必须按运行时分支。
 */
async function loadBrotliDecoder(): Promise<(bytes: Uint8Array) => Uint8Array> {
    if (!brotliModulePromise) {
        brotliModulePromise = (async () => {
            if (isNodeRuntime()) {
                const specifier = "node:" + "zlib";
                const zlib: any = await import(/* @vite-ignore */ specifier);
                return (bytes: Uint8Array) =>
                    new Uint8Array(zlib.brotliDecompressSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
            }
            // 走包根入口：它内部会调用 __wbg_init() 完成 wasm 初始化（构建时 wasm 被内联进该模块）。
            // 注意 vite optimizeDeps 必须排除该包，否则预打包后 wasm 的 MIME/URL 会出错。
            const imported: any = await import("brotli-dec-wasm");
            const mod = await (imported?.default ?? imported);
            const fn = mod?.decompress ?? mod?.brotli_dec;
            if (typeof fn !== "function") throw new Error("brotli 解码器加载失败");
            return fn as (bytes: Uint8Array) => Uint8Array;
        })();
    }
    return brotliModulePromise;
}

/** 当前环境是否具备该编码器的解码能力。 */
export function canDecompress(codec: number) {
    if (codec === CODEC_NONE) return true;
    if (codec === CODEC_GZIP) return typeof DecompressionStream !== "undefined";
    if (codec === CODEC_BROTLI) return true; // wasm，按需加载
    return false;
}

export async function decompressBytes(bytes: Uint8Array, codec: number): Promise<Uint8Array> {
    if (codec === CODEC_NONE) return bytes;
    if (codec === CODEC_GZIP) {
        if (typeof DecompressionStream === "undefined") {
            throw new Error("当前环境不支持 DecompressionStream(gzip)");
        }
        const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (codec === CODEC_BROTLI) {
        const decode = await loadBrotliDecoder();
        return decode(bytes);
    }
    throw new Error(`不支持的区段编码: ${codec}`);
}

/** 浏览器端只写 gzip（brotli 编码在 Node 侧完成），返回 null 表示不支持。 */
export async function compressBytesGzip(bytes: Uint8Array): Promise<Uint8Array | null> {
    if (typeof CompressionStream === "undefined") return null;
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------- 编码（导出）

let brotliCompressorPromise: Promise<((bytes: Uint8Array, quality: number) => Uint8Array) | null> | null = null;

async function loadBrotliCompressor(): Promise<((bytes: Uint8Array, quality: number) => Uint8Array) | null> {
    if (!brotliCompressorPromise) {
        brotliCompressorPromise = (async () => {
            if (isNodeRuntime()) {
                const specifier = "node:" + "zlib";
                const zlib: any = await import(/* @vite-ignore */ specifier);
                return (bytes: Uint8Array, quality: number) =>
                    new Uint8Array(zlib.brotliCompressSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
                        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 }
                    }));
            }
            const imported: any = await import("brotli-wasm");
            const mod = await (imported?.default ?? imported);
            const fn = mod?.compress;
            if (typeof fn !== "function") return null;
            return (bytes: Uint8Array, quality: number) => fn(bytes, { quality }) as Uint8Array;
        })();
    }
    return brotliCompressorPromise;
}

let exportCodecPromise: Promise<number> | null = null;

/** 导出时优先 brotli；若环境拿不到编码器则回落到 gzip。结果缓存。 */
export async function resolveExportCodec(): Promise<number> {
    if (!exportCodecPromise) {
        exportCodecPromise = (async () => {
            try {
                const fn = await loadBrotliCompressor();
                if (fn) {
                    // 编码器可用性自检（避免 wasm 加载失败到导出中途才报错）
                    fn(new Uint8Array(16), 1);
                    return CODEC_BROTLI;
                }
            } catch {
                /* 回落 gzip */
            }
            return CODEC_GZIP;
        })();
    }
    return exportCodecPromise;
}

/** 按指定编码器压缩（导出用）。codec=2 时如编码器不可用会抛错，调用方应先 resolveExportCodec。 */
export async function compressBytes(bytes: Uint8Array, codec: number, quality = 9): Promise<Uint8Array> {
    if (codec === CODEC_BROTLI) {
        const fn = await loadBrotliCompressor();
        if (!fn) throw new Error("brotli 编码器不可用");
        return fn(bytes, quality);
    }
    const gz = await compressBytesGzip(bytes);
    if (!gz) throw new Error("当前环境不支持 gzip 压缩");
    return gz;
}
