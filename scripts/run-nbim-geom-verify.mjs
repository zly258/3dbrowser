// 打包并运行 scripts/nbim-geom-verify.ts
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const cacheDir = path.join(root, "node_modules", ".cache");
fs.mkdirSync(cacheDir, { recursive: true });
const outfile = path.join(cacheDir, "nbim-geom-verify.bundle.mjs");
await build({
    entryPoints: [path.join(root, "scripts", "nbim-geom-verify.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile,
    logLevel: "warning",
    external: ["brotli-dec-wasm", "brotli-dec-wasm/*"]
});
await import(pathToFileURL(outfile).href);

