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

console.log('Writing distribution package metadata...');

const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords,
  license: pkg.license,
  author: pkg.author,
  type: pkg.type,
  main: './3dbrowser.js',
  module: './3dbrowser.js',
  types: './ThreeViewer.d.ts',
  exports: {
    '.': {
      types: './ThreeViewer.d.ts',
      import: './3dbrowser.js',
      require: './3dbrowser.js'
    }
  },
  files: [
    '3dbrowser.css',
    '3dbrowser.js',
    'IFCLoader-*.js',
    'OCCTLoader-*.js',
    'lmbLoader-*.js',
    'loaders-*.js',
    'meshopt_decoder.module-*.js',
    'utils-*.js',
    'ThreeViewer.d.ts',
    'assets',
    'libs',
    'src',
    'README.md',
    'LICENSE'
  ]
};

fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(distPkg, null, 2));

for (const file of ['README.md', 'LICENSE']) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) continue;
  console.log(`Copying ${file}...`);
  fs.copyFileSync(filePath, path.join(distDir, file));
}

console.log('Post-build script completed successfully!');
