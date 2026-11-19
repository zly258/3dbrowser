#!/usr/bin/env node
/**
 * web-ui-style · UI 静态审计（适配 3dbrowser React 工程）
 *
 * 用法：
 *   node scripts/ui-audit.mjs            # 顾问模式：只报告
 *   node scripts/ui-audit.mjs --strict   # 门禁：有 Error 退出码 1
 *   node scripts/ui-audit.mjs --json
 *
 * 检查项：
 *   U1  未定义 CSS 变量                          Error
 *   U2  禁用态使用 opacity                       Error
 *   U3  白字压浅底 / 深底缺前景                   Error
 *   U4  令牌对比度（WCAG AA 4.5:1）               Error
 *   U5  emoji / 图标字体                         Error
 *   U6  z-index 不在阶梯内                        Warn
 *   U7  字号不在阶梯内                            Warn
 *   U8  圆角不在阶梯内                            Warn
 *   U9  内联 style 数量超阈值                     Warn
 *   U10 裸色值（非令牌定义、非派生白名单）         Warn
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const Z_LADDER = new Set([0, 6, 10, 20, 25, 50, 60, 100, 200, 250, 400, 500, 1000, 1200, 8800, 8900, 9000, 10050, 10060, 100000, 100001]);const FS_LADDER = new Set([10.5, 11, 11.5, 12, 12.5, 13, 13.5, 15, 16, 18, 21, 22, 56]);
const RADIUS_LADDER = new Set([
  '0', '2px', '3px', '4px', '5px', '6px', '8px', '10px', '12px', '16px', '50%', '999px',
  'var(--radius)', 'var(--radius-lg)', 'var(--radius-xl)', 'var(--radius-2xl)',
  'var(--radius-xs)', 'var(--radius-sm)', 'var(--radius-md)', 'var(--radius-pill)',
  'var(--checkbox-radius)', 'var(--radius-xl)var(--radius-xl)00'
]);

const DERIVED_HEX = new Set([
  /* 令牌真值（SVG / 内联 / 图表等无法用 var() 的位置）— MD3 浅色 slate + blue-600 */
  '#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1',
  '#1e293b', '#475569', '#5b6472',
  '#2563eb', '#1d4ed8', '#1e40af', '#eff6ff', '#bfdbfe',
  '#b3261e', '#8f1d17', '#fbeceb', '#f2b8b5', '#15803d', '#f0fdf4', '#bbf7d0',
  '#b45309', '#fffbeb', '#fde68a',
  /* 派生语义色 */
  '#fef08a', '#fff8e1', '#f5f7fa', '#f2f4f7', '#b6bdc7', '#8f97a3',
  /* 主题色卡渐变（装饰性 conic-gradient） */
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]);

const CONTRAST_PAIRS = [
  ['text-main on white', '#1e293b', '#ffffff'],
  ['text-sec on white', '#475569', '#ffffff'],
  ['text-muted on white', '#5b6472', '#ffffff'],
  ['text-muted on bg-band', '#5b6472', '#f1f5f9'],
  ['text-muted on bg-app', '#5b6472', '#f8fafc'],
  ['text-muted on bg-viewport', '#5b6472', '#f8fafc'],
  ['text-sec on bg-band', '#475569', '#f1f5f9'],
  ['accent on white', '#2563eb', '#ffffff'],
  ['white on accent', '#ffffff', '#2563eb'],
  ['white on accent-hover', '#ffffff', '#1d4ed8'],
  ['accent on accent-soft', '#2563eb', '#eff6ff'],
  ['danger on white', '#b3261e', '#ffffff'],
  ['danger on danger-soft', '#b3261e', '#fbeceb'],
  ['success on white', '#15803d', '#ffffff'],
  ['success on success-soft', '#15803d', '#f0fdf4'],
  ['warn on white', '#b45309', '#ffffff'],
  ['warn on warn-soft', '#b45309', '#fffbeb'],
  ['text-muted on white (11px)', '#5b6472', '#ffffff'],
  /* 暗色主题 */
  ['dark: text-main on bg-app', '#f1f5f9', '#141619'],
  ['dark: text-sec on bg-panel', '#c7cdd6', '#1c1f24'],
  ['dark: text-muted on bg-panel', '#949dab', '#1c1f24'],
  ['dark: text-muted on bg-band', '#949dab', '#2a2e37'],
  ['dark: accent on bg-panel', '#3f85f6', '#1c1f24'],
  ['dark: accent on accent-soft', '#3f85f6', '#121c2e'],
  ['dark: white on accent-solid', '#ffffff', '#2563eb'],
  ['dark: danger on danger-soft', '#f87171', '#3b1a1a'],
  ['dark: success on success-soft', '#4ade80', '#12301f'],
  ['dark: warn on warn-soft', '#fbbf24', '#33270f'],
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F02F}]/u;

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json');

const findings = [];
const add = (sev, rule, file, line, message, hint = '') =>
  findings.push({ sev, rule, file, line: line || 0, message, hint });

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const STYLE_DIR = path.join(ROOT, 'src', 'styles');
const cssFiles = fs.readdirSync(STYLE_DIR).filter((f) => f.endsWith('.css')).sort();

function readCss(file) {
  return fs.readFileSync(path.join(STYLE_DIR, file), 'utf8');
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function collectVars(css) {
  const vars = new Map();
  const re = /:root\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const vre = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let v;
    while ((v = vre.exec(m[1]))) vars.set(v[1], v[2].trim());
  }
  return vars;
}

function collectVarUses(css) {
  const uses = [];
  const re = /var\(\s*(--[a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(css))) uses.push({ name: m[1], index: m.index });
  return uses;
}

function rules(css) {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    if (!selector) continue;
    out.push({ selector, body: m[2], index: m.index });
  }
  return out;
}

function declarations(body) {
  const out = [];
  const re = /([a-z-]+)\s*:\s*([^;]+)/gi;
  let m;
  while ((m = re.exec(body))) out.push({ prop: m[1].toLowerCase(), value: m[2].trim() });
  return out;
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const c = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

const allVars = new Map();
const cssTexts = new Map();
for (const file of cssFiles) {
  const text = readCss(file);
  cssTexts.set(file, text);
  for (const [k, v] of collectVars(text)) allVars.set(k, v);
}

/* U1 未定义变量 */
for (const [file, text] of cssTexts) {
  for (const use of collectVarUses(text)) {
    if (!allVars.has(use.name)) {
      add('error', 'U1', `src/styles/${file}`, lineOf(text, use.index),
        `引用了未定义变量 var(${use.name})`,
        '在 variables.css 的 :root 中定义，或改用标准令牌');
    }
  }
}

/* 逐规则检查 */
for (const [file, text] of cssTexts) {
  const isTokens = file === 'variables.css';
  for (const rule of rules(text)) {
    const decls = declarations(rule.body);
    const pick = (p) => (decls.find((d) => d.prop === p) || {}).value || '';
    const line = lineOf(text, rule.index);

    /* U2 禁用态 opacity */
    if (/:disabled|\[disabled\]/.test(rule.selector) && pick('opacity')) {
      add('error', 'U2', `src/styles/${file}`, line,
        `禁用态使用 opacity（${rule.selector}）`,
        '改用 background: var(--bg-band); color: var(--text-muted); border-color: var(--border-sub)');
    }

    /* U3 白字压浅底 */
    const color = pick('color').toLowerCase();
    const bg = (pick('background') || pick('background-color')).toLowerCase();
    const isWhiteText = /#fff\b|#ffffff|var\(--bg-chrome\)|var\(--accent-contrast\)|var\(--switch-thumb\)/.test(color);
    const lightBg = /var\(--bg-(app|band|panel|chrome|hover|input|sunken)\)|var\(--accent-soft\)|#e8ebef|#f0f2f5|#e2e8f0|#f8fafc|#f1f5f9|#ffffff|#fff\b/.test(bg);
    const darkBg = /var\(--accent|var\(--danger|var\(--text-main|#2563eb|#1d4ed8|#1e40af|#b3261e/.test(bg);
    if (isWhiteText && lightBg && !darkBg && color !== 'var(--accent-contrast)') {
      add('error', 'U3', `src/styles/${file}`, line,
        `白字压浅底（${rule.selector}: color ${color} / background ${bg}）`,
        '浅底必须用 --text-main / --text-sec / --text-muted');
    }

    /* U6 z-index */
    const z = pick('z-index');
    if (/^-?\d+$/.test(z) && !Z_LADDER.has(Number(z))) {
      add('warn', 'U6', `src/styles/${file}`, line, `z-index: ${z} 不在阶梯内（${rule.selector}）`, '从 docs/01 z-index 阶梯取值');
    }

    /* U7 字号 */
    const fsVal = pick('font-size');
    const fsMatch = /^([0-9.]+)px$/.exec(fsVal);
    if (fsMatch && !FS_LADDER.has(Number(fsMatch[1]))) {
      add('warn', 'U7', `src/styles/${file}`, line, `字号 ${fsVal} 不在阶梯内（${rule.selector}）`, '用 11/11.5/12/12.5/13/15/16/18');
    }

    /* U8 圆角 */
    const radius = pick('border-radius');
    if (radius && !RADIUS_LADDER.has(radius.replace(/\s+/g, ''))) {
      add('warn', 'U8', `src/styles/${file}`, line, `圆角 ${radius} 不在阶梯内（${rule.selector}）`, '用 2px / 3px / 4px / 999px');
    }

    /* U10 裸色值 */
    if (!isTokens) {
      for (const d of decls) {
        if (!/^(background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|color|outline-color|fill|stroke|box-shadow)$/.test(d.prop)) continue;
        const hexes = d.value.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        for (const hex of hexes) {
          const low = hex.toLowerCase();
          if (low === '#fff' || low === '#ffffff' || DERIVED_HEX.has(low)) continue;
          add('warn', 'U10', `src/styles/${file}`, line, `裸色值 ${hex}（${rule.selector} { ${d.prop} }）`, '改用 var(--token)');
        }
      }
    }
  }

  /* U5 emoji */
  const emoji = EMOJI_RE.exec(text);
  if (emoji) {
    add('error', 'U5', `src/styles/${file}`, lineOf(text, emoji.index),
      `检测到 emoji / 装饰性 Unicode：${emoji[0]}`, '改用内联 SVG 图标');
  }
}

/* U4 对比度 */
for (const [label, fg, bg] of CONTRAST_PAIRS) {
  const r = ratio(fg, bg);
  if (r < 4.5) {
    add('error', 'U4', '(tokens)', 0, `对比度不足：${label} = ${r.toFixed(2)}:1 < 4.5:1`, '调整令牌取值');
  }
}

/* TSX：emoji、内联 style、禁用态 opacity */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const tsxFiles = walk(path.join(ROOT, 'src'));
let inlineStyleCount = 0;
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const emoji = EMOJI_RE.exec(text);
  if (emoji) {
    add('error', 'U5', rel, lineOf(text, emoji.index), `检测到 emoji：${emoji[0]}`, '改用内联 SVG 图标');
  }
  if (/opacity\s*:\s*(disabled|0\.\d+)/.test(text) && /disabled/.test(text)) {
    add('warn', 'U2', rel, 0, '疑似用 opacity 表达禁用态', '改用禁用态令牌颜色');
  }
  const inline = text.match(/style=\{\{/g) || [];
  inlineStyleCount += inline.length;
}

/* 内联样式分布（仅统计，超过阈值提示） */
const INLINE_THRESHOLD = 60;
if (inlineStyleCount > INLINE_THRESHOLD) {
  add('warn', 'U9', 'src/**/*.tsx', 0, `内联 style 共 ${inlineStyleCount} 处（阈值 ${INLINE_THRESHOLD}）`, '静态颜色/边框/字号请回到样式类');
}

/* index.html 启动壳 */
const htmlPath = path.join(ROOT, 'index.html');
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const emoji = EMOJI_RE.exec(html);
  if (emoji) add('error', 'U5', 'index.html', lineOf(html, emoji.index), `检测到 emoji：${emoji[0]}`);
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

const errors = findings.filter((f) => f.sev === 'error');
const warns = findings.filter((f) => f.sev === 'warn');

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, errors, warnings: warns, summary: { errors: errors.length, warnings: warns.length } }, null, 2));
} else {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }
  console.log('');
  console.log('web-ui-style · UI 审计  ' + ROOT);
  console.log('='.repeat(64));
  for (const rule of ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10']) {
    const list = byRule.get(rule);
    if (!list) continue;
    console.log(`\n[${rule}] ${list.length} 项`);
    for (const f of list) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      console.log(`  ${f.sev === 'error' ? '✗' : '!'} ${loc}`);
      console.log(`    ${f.message}`);
      if (f.hint) console.log(`    → ${f.hint}`);
    }
  }
  console.log('\n' + '='.repeat(64));
  console.log(`Error ${errors.length}  ·  Warn ${warns.length}`);
  if (errors.length === 0) console.log('✓ 无阻断项');
}

process.exit(STRICT && errors.length ? 1 : 0);
