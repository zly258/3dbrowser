/**
 * 类名覆盖率检查：TSX 中出现的每个 className 标识符是否在样式表中有对应选择器。
 * 用法：node scripts/class-coverage.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const used = new Map();
const JS_KEYWORDS = new Set([
  'false', 'true', 'null', 'undefined', 'else', 'return', 'if', 'const', 'let', 'var',
  'is', 'off', 'on', 'and', 'or', 'not'
]);
for (const file of walk(path.join(ROOT, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const re = /className\s*=\s*(?:\{`([^`]*)`\}|\{?"([^"]*)"|\{?'([^']*)')/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] || m[2] || m[3] || '';
    for (const token of raw.split(/\s+/)) {
      if (!token || token.includes('${')) continue;
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) continue;
      if (JS_KEYWORDS.has(token)) continue;
      if (!used.has(token)) used.set(token, new Set());
      used.get(token).add(rel);
    }
  }
}

const styleDir = path.join(ROOT, 'src', 'styles');
const css = fs
  .readdirSync(styleDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(styleDir, f), 'utf8'))
  .join('\n');

const missing = [];
for (const [token, files] of [...used.entries()].sort()) {
  const re = new RegExp(`\\.${token.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])`);
  if (!re.test(css)) missing.push([token, [...files].join(', ')]);
}

console.log(`TSX 使用类名: ${used.size}  未在样式中定义: ${missing.length}`);
for (const [token, files] of missing) console.log(`  ${token}  <- ${files}`);
