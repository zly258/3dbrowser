/**
 * .lmb（应用自定义格式，几何 + 名称，无 BIM 属性）→ .nbim v11 批量转换。
 *
 * 复用应用自身的 LMBLoader.parse（纯 JS，不依赖 DOM/WebGL）解析，
 * 再用 buildNbimBlobFromObjects 直接构建 NBIM v11 单文件（brotli + 64KB 属性块 + 紧凑构件表），
 * 与 nbim 批量转换脚本的产出一致。
 *
 * 用法：
 *   node scripts/run-lmb-batch-convert.mjs <srcDir> <dstDir> [--limit N] [--filter 子串] [--verify-only]
 */
import fs from "node:fs";
import path from "node:path";
import { LMBLoader } from "../src/loader/lmbLoader";
import { buildNbimBlobFromObjects } from "../src/utils/scene-manager/nbimBatchConvert";

// Node 环境没有 requestAnimationFrame：octree 的分片让步（大模型 collectItemsBatched）用它，
// 这里用 setTimeout 顶替，避免 "requestAnimationFrame is not defined"。
if (typeof (globalThis as any).requestAnimationFrame !== "function") {
    (globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 0) as any;
    (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
}

const NBIM11_MAGIC = 0x314d424e; // "NBM1"
const NBIM11_VERSION = 11;

interface Args {
    srcDir: string;
    dstDir: string;
    limit: number;
    filter: string;
    verifyOnly: boolean;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const positional: string[] = [];
    let limit = Infinity;
    let filter = "";
    let verifyOnly = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--limit") { limit = Number(argv[++i] || "0") || Infinity; }
        else if (a === "--filter") { filter = String(argv[++i] || ""); }
        else if (a === "--verify-only") { verifyOnly = true; }
        else positional.push(a);
    }
    if (positional.length < 2) {
        console.error("用法: run-lmb-batch-convert.mjs <srcDir> <dstDir> [--limit N] [--filter 子串] [--verify-only]");
        process.exit(1);
    }
    return { srcDir: path.resolve(positional[0]), dstDir: path.resolve(positional[1]), limit, filter, verifyOnly };
}

function listFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const name of fs.readdirSync(d)) {
            const p = path.join(d, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else if (name.toLowerCase().endsWith(".lmb")) out.push(p);
        }
    };
    walk(dir);
    out.sort((a, b) => a.localeCompare(b, "zh"));
    return out;
}

function countSource(group: any) {
    let meshes = 0, instances = 0, verts = 0, faces = 0;
    group.traverse((o: any) => {
        if (!o.isMesh || !o.geometry) return;
        meshes++;
        const n = o.isInstancedMesh ? o.count : 1;
        instances += n;
        const pos = o.geometry.attributes?.position;
        if (pos) verts += pos.count * n;
        const idx = o.geometry.index;
        if (idx) faces += (idx.count / 3) * n;
        else if (pos) faces += (pos.count / 3) * n;
    });
    return { meshes, instances, verts, faces: Math.floor(faces) };
}

function checkNbimHeader(buf: Buffer): { ok: boolean; version: number; reason?: string } {
    if (buf.length < 1024) return { ok: false, version: -1, reason: "文件过小" };
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    if (magic !== NBIM11_MAGIC) return { ok: false, version, reason: `magic 0x${magic.toString(16)}` };
    if (version !== NBIM11_VERSION) return { ok: false, version, reason: `version ${version}` };
    const manifestOffset = buf.readUInt32LE(8);
    const manifestLength = buf.readUInt32LE(12);
    const propertyOffset = buf.readUInt32LE(16);
    const propertyLength = buf.readUInt32LE(20);
    if (!(manifestOffset > 0 && manifestLength > 0)) return { ok: false, version, reason: "manifest 为空" };
    if (!(propertyOffset > 0 && propertyLength > 0)) return { ok: false, version, reason: "property 区段为空" };
    return { ok: true, version };
}

async function convertOne(src: string, dst: string): Promise<{ ok: boolean; log: string }> {
    const stem = path.basename(src, path.extname(src));
    const dstFile = path.join(dst, `${stem}.nbim`);
    if (fs.existsSync(dstFile) && fs.statSync(dstFile).size > 1024) {
        return { ok: true, log: `跳过（已存在）` };
    }
    const t0 = Date.now();
    const buffer = fs.readFileSync(src);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const group: any = new LMBLoader().parse(ab as ArrayBuffer, () => {}, { fastMode: false });
    group.name = stem; // 结构树根名用文件名，避免显示成 "LMB_Root"
    if (!group.userData) group.userData = {};
    group.userData.bimId = stem;
    const srcStat = countSource(group);
    const tParse = Date.now();

    const result = await buildNbimBlobFromObjects({ objects: [group as any], fileNames: [stem] });
    const tBuild = Date.now();
    const outBuf = Buffer.from(await result.fileBlob.arrayBuffer());
    const header = checkNbimHeader(outBuf);
    if (!header.ok) {
        if (fs.existsSync(dstFile)) fs.rmSync(dstFile, { force: true });
        return { ok: false, log: `❌ 头部校验失败: ${header.reason}` };
    }
    fs.writeFileSync(dstFile, outBuf);
    // 释放
    (group as any).traverse?.((o: any) => { if (o.geometry) o.geometry.dispose?.(); });
    const srcMB = buffer.length / 1048576;
    const dstMB = outBuf.length / 1048576;
    return {
        ok: true,
        log: `${srcMB.toFixed(2)} MB → ${dstMB.toFixed(2)} MB  ${(srcMB / Math.max(dstMB, 1e-6)).toFixed(1)}x  分块 ${result.chunkCount}  实例 ${srcStat.instances}  顶点 ${srcStat.verts}  面 ${srcStat.faces}  (解析 ${((tParse - t0) / 1000).toFixed(1)}s, 构建 ${((tBuild - tParse) / 1000).toFixed(1)}s)`
    };
}

function verifyOne(src: string, dst: string): { ok: boolean; log: string } {
    const stem = path.basename(src, path.extname(src));
    const dstFile = path.join(dst, `${stem}.nbim`);
    if (!fs.existsSync(dstFile)) return { ok: false, log: `❌ 缺失` };
    const buf = fs.readFileSync(dstFile);
    const header = checkNbimHeader(buf);
    if (!header.ok) return { ok: false, log: `❌ ${header.reason}` };
    return { ok: true, log: `${(buf.length / 1048576).toFixed(2)} MB  v${header.version}` };
}

async function main() {
    const args = parseArgs();
    fs.mkdirSync(args.dstDir, { recursive: true });
    const files = listFiles(args.srcDir).filter((f) => !args.filter || path.basename(f).includes(args.filter));
    const logPath = path.join(args.dstDir, "_lmb_convert.log");
    const log = (line: string) => {
        const s = `[${new Date().toISOString()}] ${line}`;
        console.log(line);
        fs.appendFileSync(logPath, s + "\n");
    };
    log(`===== ${args.verifyOnly ? "校验" : "转换"}开始：源 ${args.srcDir}，目标 ${args.dstDir}，共 ${files.length} 个 .lmb =====`);

    let done = 0, processed = 0, failed = 0;
    const t0 = Date.now();
    for (let i = 0; i < files.length; i++) {
        const src = files[i];
        const idx = `[${i + 1}/${files.length}]`;
        if (args.verifyOnly) {
            const r = verifyOne(src, args.dstDir);
            log(`${idx} ${path.basename(src)}  ${r.log}`);
            if (r.ok) done++; else failed++;
            continue;
        }
        processed++;
        try {
            const r = await convertOne(src, args.dstDir);
            if (r.ok) { done++; log(`${idx} ${path.basename(src)}  ${r.log}`); }
            else { failed++; log(`${idx} ${path.basename(src)}  ${r.log}`); }
        } catch (e: any) {
            failed++;
            log(`${idx} ${path.basename(src)}  ❌ 异常: ${e?.message || e}`);
            const dstFile = path.join(args.dstDir, `${path.basename(src, path.extname(src))}.nbim`);
            if (fs.existsSync(dstFile) && fs.statSync(dstFile).size <= 1024) fs.rmSync(dstFile, { force: true });
        }
        if (processed % 20 === 0) {
            log(`--- 进度 ${i + 1}/${files.length}，成功 ${done}，失败 ${failed}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟 ---`);
        }
        if (processed >= args.limit) { log(`--- 达到 --limit ${args.limit}，停止 ---`); break; }
    }
    log(`===== 完成：成功 ${done}，失败 ${failed}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟 =====`);
    if (failed > 0) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
