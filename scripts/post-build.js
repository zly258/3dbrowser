import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const destDir = path.resolve(rootDir, 'example/3dbrowser-lib');

console.log('Starting post-build script...');

// 1. Clean and recreate destination directory
if (fs.existsSync(destDir)) {
  console.log(`Cleaning existing directory: ${destDir}`);
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

// 2. Copy dist content to destination
if (fs.existsSync(distDir)) {
  console.log(`Copying dist content from ${distDir} to ${destDir}`);
  fs.cpSync(distDir, destDir, { recursive: true });
} else {
  console.error(`Dist directory not found: ${distDir}`);
  process.exit(1);
}

// 3. Modify and write package.json to destination
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

console.log('Updating package.json for distribution...');

// Update paths for the lib version
pkg.main = './3dbrowser.umd.js';
pkg.module = './3dbrowser.es.js';
pkg.types = './index.d.ts';

if (pkg.exports) {
  pkg.exports['.'] = {
    types: './index.d.ts',
    import: './3dbrowser.es.js',
    require: './3dbrowser.umd.js'
  };
}

// Write the modified package.json
const destPkgPath = path.join(destDir, 'package.json');
fs.writeFileSync(destPkgPath, JSON.stringify(pkg, null, 2));

// 4. Copy README and LICENSE if they exist
['README.md', 'LICENSE'].forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`Copying ${file}...`);
    fs.copyFileSync(filePath, path.join(destDir, file));
  }
});

console.log('Post-build script completed successfully!');
