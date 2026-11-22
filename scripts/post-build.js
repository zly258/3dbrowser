import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');

console.log('Starting post-build script...');

if (!fs.existsSync(distDir)) {
  console.error(`Dist directory not found: ${distDir}`);
  process.exit(1);
}

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// 产出的 .d.ts 里带着 `import "./styles/index.css";`（源码这样做是为了副作用引入样式），
// 但 dist 不打包 src/styles，消费方类型检查会因找不到该模块而报错。这里统一剥掉。
let strippedDts = 0;
function stripCssImports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripCssImports(full);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) continue;
    const text = fs.readFileSync(full, 'utf8');
    const next = text.replace(/^\s*import\s+["'][^"']+\.css["'];?\s*$/gm, '');
    if (next !== text) {
      fs.writeFileSync(full, next, 'utf8');
      strippedDts++;
    }
  }
}
stripCssImports(distDir);

console.log('Writing distribution package metadata...');

const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords,
  license: pkg.license,
  author: pkg.author,
  repository: pkg.repository,
  homepage: pkg.homepage,
  bugs: pkg.bugs,
  type: 'module',
  main: './3dbrowser.js',
  module: './3dbrowser.js',
  types: './index.d.ts',
  // 只有样式文件是无副作用的例外；其余模块都应按需 tree-shake
  sideEffects: ['*.css'],
  exports: {
    '.': {
      types: './index.d.ts',
      import: './3dbrowser.js'
    },
    './3dbrowser.css': './3dbrowser.css',
    './package.json': './package.json'
  },
  // 构建时 external 掉的运行时依赖（react / react-dom / three）必须由宿主提供
  peerDependencies: {
    react: '>=18',
    'react-dom': '>=18',
    three: '>=0.150'
  },
  // 显式列出产出的子目录与文件，包括动态 import 生成的 index-*.js / index.web-*.js
  // （旧清单漏了它们，导致按包发布后 brotli 解码路径在运行时 404）。
  files: [
    '*.js',
    '*.css',
    '*.d.ts',
    'assets',
    'components',
    'hooks',
    'loader',
    'theme',
    'utils',
    'viewer',
    'libs',
    'README.md',
    'README.zh-CN.md',
    'LICENSE'
  ]
};

fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(distPkg, null, 2));

for (const file of ['README.md', 'README.zh-CN.md', 'LICENSE']) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) continue;
  console.log(`Copying ${file}...`);
  fs.copyFileSync(filePath, path.join(distDir, file));
}

console.log(`Stripped CSS imports from ${strippedDts} declaration files.`);
console.log('Post-build script completed successfully!');
