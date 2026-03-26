import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const baselineFile = path.join(rootDir, "scripts", "bundle-size-baseline.json");

if (!fs.existsSync(distDir)) {
  console.error("dist 目录不存在，请先执行构建。");
  process.exit(1);
}

const current = {};
const distFiles = fs.readdirSync(distDir);
const mainFile = "3dbrowser.js";
if (distFiles.includes(mainFile)) {
  current.main = fs.statSync(path.join(distDir, mainFile)).size;
}
const loadersFile = distFiles.find((file) => /^loaders-.*\.js$/.test(file));
if (loadersFile) {
  current.loaders = fs.statSync(path.join(distDir, loadersFile)).size;
}

if (!fs.existsSync(baselineFile)) {
  fs.writeFileSync(
    baselineFile,
    JSON.stringify({ bytes: current, maxGrowthRatio: 0.12 }, null, 2),
    "utf-8"
  );
  console.log("已生成初始体积基线文件。");
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf-8"));
const maxGrowthRatio = typeof baseline.maxGrowthRatio === "number" ? baseline.maxGrowthRatio : 0.12;
const baselineBytes = baseline.bytes || {};

let hasRegression = false;
for (const [bundleName, size] of Object.entries(current)) {
  const oldSize = baselineBytes[bundleName];
  if (!oldSize) continue;
  const growth = (size - oldSize) / oldSize;
  const growthPercent = (growth * 100).toFixed(2);
  console.log(`${bundleName}: ${oldSize} -> ${size} (${growthPercent}%)`);
  if (growth > maxGrowthRatio) {
    console.error(`体积回归超阈值: ${bundleName} 增长 ${growthPercent}%`);
    hasRegression = true;
  }
}

if (hasRegression) {
  process.exit(2);
}

console.log("体积检查通过。");
