import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const cacheDir = path.join(root, "node_modules", ".cache");
const outfile = path.join(cacheDir, "lmb-batch-convert.bundle.mjs");
fs.mkdirSync(cacheDir, { recursive: true });

await build({
    entryPoints: [path.join(root, "scripts", "lmb-batch-convert.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile,
    logLevel: "warning",
    external: ["brotli-dec-wasm", "brotli-dec-wasm/*", "brotli-wasm", "brotli-wasm/*"]
});

await import(pathToFileURL(outfile).href);
