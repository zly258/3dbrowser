import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const srcDir = path.join(
  rootDir,
  "node_modules",
  "@zhangly1403",
  "3dbrowser",
  "dist",
  "libs"
);
const dstDir = path.join(rootDir, "public", "libs");
const packageDistDir = path.join(
  rootDir,
  "node_modules",
  "@zhangly1403",
  "3dbrowser",
  "dist"
);

function copyDirRecursive(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  const entries = fs.readdirSync(from, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(from, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

if (!fs.existsSync(srcDir)) {
  console.error(`未找到库资源目录: ${srcDir}`);
  process.exit(1);
}

const ensureFile = (targetPath, fallbackPath) => {
  if (!fs.existsSync(targetPath) && fs.existsSync(fallbackPath)) {
    fs.copyFileSync(fallbackPath, targetPath);
  }
};

ensureFile(
  path.join(packageDistDir, "3dbrowser.es.js"),
  path.join(packageDistDir, "3dbrowser.js")
);
ensureFile(
  path.join(packageDistDir, "3dbrowser.umd.js"),
  path.join(packageDistDir, "3dbrowser.js")
);
ensureFile(
  path.join(packageDistDir, "index.d.ts"),
  path.join(packageDistDir, "ThreeViewer.d.ts")
);

copyDirRecursive(srcDir, dstDir);
console.log(`已同步 libs 到 ${dstDir}`);
