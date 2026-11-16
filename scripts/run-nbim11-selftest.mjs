// 打包并运行 scripts/nbim11-selftest.ts（Node，无需浏览器）。
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const entry = path.join(root, "scripts", "nbim11-selftest.ts");
const cacheDir = path.join(root, "node_modules", ".cache");
const outfile = path.join(cacheDir, "nbim11-selftest.bundle.mjs");
fs.mkdirSync(cacheDir, { recursive: true });

await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile,
    logLevel: "warning",
    external: ["brotli-dec-wasm", "brotli-dec-wasm/*"]
});

await import(pathToFileURL(outfile).href);

