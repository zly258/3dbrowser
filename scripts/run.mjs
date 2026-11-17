#!/usr/bin/env node
/**
 * 统一的 TS 工具脚本运行器。
 *
 * 背景：scripts 下有少量用 TypeScript 写的离线工具（当前为 NBIM v11 自测），
 * 它们不能直接被 node 执行，需要先用 esbuild 打包。此前每个脚本都配了一份
 * 20 行的 run-xxx.mjs 样板，内容除了入口名完全相同；这里合并为一个通用运行器。
 *
 * 用法：
 *   node scripts/run.mjs <脚本名> [参数...]
 *   node scripts/run.mjs nbim11-selftest
 *
 * 也可省略 .ts 后缀；不带参数会列出可用脚本，入口不存在时报错并给出列表。
 *
 * 注意：会在导入前还原 process.argv，使被运行的脚本看到的仍是
 * argv[1]=脚本路径、argv[2..]=用户参数，从而与直接运行 run-xxx.mjs 时完全一致
 * （脚本内部据此解析参数并判断“是否作为入口被直接调用”）。
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const [entryArg, ...userArgs] = process.argv.slice(2);

if (!entryArg || entryArg === "--help" || entryArg === "-h") {
    const available = fs
        .readdirSync(path.join(process.cwd(), "scripts"))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => name.replace(/\.ts$/, ""));
    console.log("用法: node scripts/run.mjs <脚本名> [参数...]");
    console.log("可运行的脚本:");
    for (const name of available) console.log("  - " + name);
    process.exit(entryArg ? 0 : 1);
}

const root = process.cwd();
const entryPath = path.join(root, "scripts", entryArg.endsWith(".ts") ? entryArg : `${entryArg}.ts`);

if (!fs.existsSync(entryPath)) {
    console.error(`找不到脚本: ${entryArg}`);
    const available = fs
        .readdirSync(path.join(root, "scripts"))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => name.replace(/\.ts$/, ""));
    console.error("可运行的脚本: " + available.join(", "));
    process.exit(1);
}

const cacheDir = path.join(root, "node_modules", ".cache");
const outfile = path.join(cacheDir, `${path.basename(entryPath, ".ts")}.bundle.mjs`);
fs.mkdirSync(cacheDir, { recursive: true });

await build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile,
    logLevel: "warning",
    external: ["brotli-dec-wasm", "brotli-dec-wasm/*"]
});

// 还原被运行脚本视角的 argv（见文件头说明）
process.argv = [process.argv[0], entryPath, ...userArgs];

await import(pathToFileURL(outfile).href);
