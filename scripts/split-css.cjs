const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'styles');
const cssPath = path.join(srcDir, 'index.css');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

// Parse CSS into top-level blocks
const rawBlocks = [];
let currentBlock = '';
let bracketCount = 0;
let inComment = false;

for (let i = 0; i < cssContent.length; i++) {
  const char = cssContent[i];
  const nextChar = cssContent[i + 1];

  if (!inComment && char === '/' && nextChar === '*') {
    inComment = true;
  }

  currentBlock += char;

  if (inComment && char === '*' && nextChar === '/') {
    inComment = false;
    currentBlock += nextChar;
    i++;
    continue;
  }

  if (!inComment) {
    if (char === '{') bracketCount++;
    if (char === '}') {
      bracketCount--;
      if (bracketCount === 0) {
        rawBlocks.push(currentBlock.trim());
        currentBlock = '';
      }
    }
  }
}

if (currentBlock.trim()) {
  rawBlocks.push(currentBlock.trim());
}

console.log(`Parsed ${rawBlocks.length} CSS blocks.`);

// Clean colors helper: replace light hardcoded colors with theme variables for Dark theme compatibility
function cleanBlockColors(code) {
  return code
    .replace(/background:\s*#ffffff;/g, 'background: var(--bg-panel);')
    .replace(/background:\s*#fff;/g, 'background: var(--bg-panel);')
    .replace(/background-color:\s*#ffffff;/g, 'background-color: var(--bg-panel);')
    .replace(/background-color:\s*#fff;/g, 'background-color: var(--bg-panel);')
    .replace(/background:\s*#f8fafc;/g, 'background: var(--bg-primary);')
    .replace(/background-color:\s*#f8fafc;/g, 'background-color: var(--bg-primary);')
    .replace(/background:\s*#f1f5f9;/g, 'background: var(--bg-header);')
    .replace(/background-color:\s*#f1f5f9;/g, 'background-color: var(--bg-header);')
    .replace(/border-color:\s*#e2e8f0;/g, 'border-color: var(--border-color);')
    .replace(/color:\s*#0f172a;/g, 'color: var(--text-primary);')
    .replace(/color:\s*#334155;/g, 'color: var(--text-secondary);')
    .replace(/color:\s*#64748b;/g, 'color: var(--text-muted);');
}

const categories = {
  reset: [],
  layout: [],
  toolbar: [],
  panel: [],
  statusBar: [],
  tabs: [],
  canvas: [],
  overlays: [],
  search: [],
  components: []
};

function categorize(block) {
  // If it's the old :root or keyframes, we skip it since variables.css defines them comprehensively
  if (block.startsWith(':root') || block.startsWith('@keyframes')) {
    return 'skip';
  }

  // Reset
  if (block.startsWith('*') || block.startsWith('html') || block.startsWith('body') ||
      block.match(/^(button|input|select|textarea|svg|::-webkit-scrollbar)\b/)) {
    return 'reset';
  }

  // Layout: shell, main layout, viewport shell, sidebars
  if (block.includes('.ui-app-shell') || block.includes('.ui-main-layout') ||
      block.includes('.ui-viewport-shell') || block.includes('.ui-sidebar')) {
    return 'layout';
  }

  // Toolbar & Menus
  if (block.includes('.ui-toolbar') || block.includes('.ui-menu-bar') || block.includes('.ui-menu-item') ||
      block.includes('.ui-dropdown')) {
    return 'toolbar';
  }

  // Status Bar
  if (block.includes('.ui-status-bar') || block.includes('.ui-stats') || block.includes('.ui-monitor')) {
    return 'statusBar';
  }

  // Tabs & Segmented Control
  if (block.includes('.ui-tabs') || block.includes('.ui-segmented')) {
    return 'tabs';
  }

  // Canvas, ViewCube & Context Menu
  if (block.includes('.ui-viewport-canvas') || block.includes('.ui-viewcube') || block.includes('.ui-context-menu')) {
    return 'canvas';
  }

  // Overlays: Modal, Loading, Toast, Tooltip
  if (block.includes('.ui-modal') || block.includes('.ui-loading') || block.includes('.ui-toast') ||
      block.includes('.ui-tooltip') || block.includes('.ui-confirm-modal') || block.includes('.ui-about-modal')) {
    return 'overlays';
  }

  // Search, Clash Check & Pagination
  if (block.includes('.ui-search') || block.includes('.ui-clash') || block.includes('.ui-pagination')) {
    return 'search';
  }

  // Panel: FloatingPanel and panel bodies
  if (block.includes('.ui-floating-panel') || block.includes('.ui-panel') || block.includes('.ui-tree') ||
      block.includes('.ui-properties') || block.includes('.ui-settings') || block.includes('.ui-explode') ||
      block.includes('.ui-clip') || block.includes('.ui-measure') || block.includes('.ui-screenshot') ||
      block.includes('.ui-export') || block.includes('.ui-viewpoint') || block.includes('.ui-data-panel') ||
      block.includes('.ui-choice-card') || block.includes('.ui-toolpanel')) {
    return 'panel';
  }

  // Form controls & common components
  return 'components';
}

rawBlocks.forEach((block) => {
  const cat = categorize(block);
  if (cat !== 'skip') {
    categories[cat].push(cleanBlockColors(block));
  }
});

// Define variables.css
const variablesCss = `/*
 * Material Design 2 dense 风格设计令牌。
 *
 * 变量名兼容原有 --bg-* / --surface* / --primary / --accent 体系，
 * 取值对齐 MD2 dense：4dp/2dp 圆角、Roboto/系统字体栈、42px 工具栏、
 * 32px 控件高、18px 图标、elevation 阴影与 state layer。
 */
:root {
  color-scheme: light;
  --font-family-ui: 'Roboto', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
  --font-family: var(--font-family-ui);
  --font-size-base: 13px;
  --font-size-body: 13px;
  --font-size-secondary: 12px;
  --font-size-label: 11px;
  --font-size-title: 14px;
  --font-size-large: 15px;
  --line-height: 1.5;

  /* MD2 dense 控件尺寸 */
  --control-height: 32px;
  --control-h-xs: 22px;
  --control-h-sm: 26px;
  --control-h-md: 30px;
  --control-h-lg: 34px;

  --toolbar-height: 42px;
  --icon-size: 18px;
  --icon-size-small: 16px;
  --icon-button-size: 30px;
  --icon-button-gap: 2px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;

  /* MD2 规范圆角：小部件 2px，主卡片/面板/按钮 4px */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 4px;
  --radius-lg: 4px;
  --radius-xl: 6px;
  --radius-small: 2px;
  --radius-medium: 4px;
  --radius-large: 4px;
  --radius-full: 9999px;
  --icon-button-radius: var(--radius-sm);

  /* MD2 light：background #FAFAFA / surface #FFFFFF / header #F5F5F5 */
  --bg-primary: #fafafa;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f5f5f5;
  --bg-panel: #ffffff;
  --bg-canvas: #fafafa;
  --bg-header: #f5f5f5;
  --bg-elevated: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-active: rgba(0, 0, 0, 0.12);
  --bg-selected: rgba(25, 118, 210, 0.12);
  --bg-soft: rgba(25, 118, 210, 0.08);
  --bg-soft-strong: rgba(25, 118, 210, 0.14);

  --bg-glass: var(--bg-secondary);
  --blur-overlay: none;

  --border-color: rgba(0, 0, 0, 0.12);
  --border-strong: rgba(0, 0, 0, 0.2);
  --border-hover: rgba(0, 0, 0, 0.24);
  --border-light: rgba(0, 0, 0, 0.08);

  --text-primary: rgba(0, 0, 0, 0.87);
  --text-secondary: rgba(0, 0, 0, 0.6);
  --text-muted: rgba(0, 0, 0, 0.38);
  --text-disabled: rgba(0, 0, 0, 0.38);
  --text-bright: #000000;

  /* MD2 state layers */
  --state-hover: rgba(0, 0, 0, 0.08);
  --state-active: rgba(0, 0, 0, 0.12);
  --state-focus: rgba(0, 0, 0, 0.12);
  --divider: rgba(0, 0, 0, 0.12);

  /* MD2 Blue 700 经典蓝 */
  --accent-blue: #1976d2;
  --accent-blue-hover: #1565c0;
  --accent-blue-soft: rgba(25, 118, 210, 0.12);
  --accent: #1976d2;
  --accent-hover: #1565c0;
  --accent-active: #0d47a1;
  --accent-focus: rgba(25, 118, 210, 0.18);
  --accent-subtle: rgba(25, 118, 210, 0.12);
  --primary: #1976d2;
  --primary-hover: #1565c0;
  --primary-active: #0d47a1;
  --primary-focus: rgba(25, 118, 210, 0.18);
  --primary-container: rgba(25, 118, 210, 0.12);

  --success-color: #2e7d32;
  --success: #2e7d32;
  --error-color: #d32f2f;
  --error: #d32f2f;
  --warning-color: #f9a825;
  --warning: #f9a825;
  --info: var(--accent);

  /* MD2 surfaces */
  --surface: #fafafa;
  --surface-dim: #f0f0f0;
  --surface-bright: #ffffff;
  --surface-container-low: #fafafa;
  --surface-container: #ffffff;
  --surface-container-high: #f5f5f5;
  --surface-container-highest: #eeeeee;
  --surface-canvas: #fafafa;
  --surface-overlay: rgba(255, 255, 255, 0.95);
  --surface-glass: rgba(255, 255, 255, 0.95);
  --surface-hover: var(--bg-hover);
  --surface-active: var(--bg-active);
  --surface-selected: var(--bg-selected);
  --surface-soft: var(--bg-soft);
  --surface-soft-strong: var(--bg-soft-strong);

  --outline: var(--border-color);
  --outline-variant: var(--border-light);
  --outline-strong: var(--border-strong);
  --on-surface: var(--text-primary);
  --on-surface-variant: var(--text-secondary);
  --on-surface-muted: var(--text-muted);
  --on-surface-disabled: var(--text-disabled);

  /* MD2 elevation：1dp / 4dp / 8dp(menu) / 16dp(panel·dialog) */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 3px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.15), 0 6px 6px rgba(0, 0, 0, 0.12);
  --shadow-menu: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12);
  --shadow-panel: 0 8px 10px -5px rgba(0, 0, 0, 0.2), 0 16px 24px 2px rgba(0, 0, 0, 0.14), 0 6px 30px 5px rgba(0, 0, 0, 0.12);

  --scrollbar-track: #f5f5f5;
  --scrollbar-thumb: #bdbdbd;
  --scrollbar-thumb-hover: #9e9e9e;
  --overlay-scrim: rgba(0, 0, 0, 0.5);
  --toolbar-menu-max-height: calc(100vh - 100px);
}

.theme-dark, [data-theme="dark"] {
  color-scheme: dark;

  /* MD2 dark：background/surface #121212，elevation overlay 逐级提亮 */
  --bg-primary: #121212;
  --bg-secondary: #1e1e1e;
  --bg-tertiary: #262626;
  --bg-panel: #1e1e1e;
  --bg-canvas: #121212;
  --bg-header: #262626;
  --bg-elevated: #2c2c2c;
  --bg-hover: rgba(255, 255, 255, 0.04);
  --bg-active: rgba(255, 255, 255, 0.12);
  --bg-selected: rgba(144, 202, 249, 0.16);
  --bg-soft: rgba(144, 202, 249, 0.12);
  --bg-soft-strong: rgba(144, 202, 249, 0.2);

  --bg-glass: var(--bg-secondary);
  --blur-overlay: none;

  --border-color: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.2);
  --border-hover: rgba(255, 255, 255, 0.24);
  --border-light: rgba(255, 255, 255, 0.08);

  --text-primary: rgba(255, 255, 255, 0.87);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-muted: rgba(255, 255, 255, 0.38);
  --text-disabled: rgba(255, 255, 255, 0.38);
  --text-bright: #ffffff;

  --state-hover: rgba(255, 255, 255, 0.08);
  --state-active: rgba(255, 255, 255, 0.12);
  --state-focus: rgba(255, 255, 255, 0.12);
  --divider: rgba(255, 255, 255, 0.12);

  /* MD2 dark 主色 blue 300 */
  --accent-blue: #90caf9;
  --accent-blue-hover: #64b5f6;
  --accent-blue-soft: rgba(144, 202, 249, 0.16);
  --accent: #90caf9;
  --accent-hover: #64b5f6;
  --accent-active: #42a5f5;
  --accent-focus: rgba(144, 202, 249, 0.24);
  --accent-subtle: rgba(144, 202, 249, 0.16);
  --primary: #90caf9;
  --primary-hover: #64b5f6;
  --primary-active: #42a5f5;
  --primary-focus: rgba(144, 202, 249, 0.24);
  --primary-container: rgba(144, 202, 249, 0.16);

  --success-color: #81c784;
  --success: #81c784;
  --error-color: #ef9a9a;
  --error: #ef9a9a;
  --warning-color: #fff176;
  --warning: #fff176;
  --info: var(--accent);

  --surface: #121212;
  --surface-dim: #0a0a0a;
  --surface-bright: #2c2c2c;
  --surface-container-low: #181818;
  --surface-container: #1e1e1e;
  --surface-container-high: #262626;
  --surface-container-highest: #2c2c2c;
  --surface-canvas: #121212;
  --surface-overlay: rgba(30, 30, 30, 0.95);
  --surface-glass: rgba(30, 30, 30, 0.95);
  --surface-hover: var(--bg-hover);
  --surface-active: var(--bg-active);
  --surface-selected: var(--bg-selected);
  --surface-soft: var(--bg-soft);
  --surface-soft-strong: var(--bg-soft-strong);

  --outline: var(--border-color);
  --outline-variant: var(--border-light);
  --outline-strong: var(--border-strong);
  --on-surface: var(--text-primary);
  --on-surface-variant: var(--text-secondary);
  --on-surface-muted: var(--text-muted);
  --on-surface-disabled: var(--text-disabled);

  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.6);
  --shadow-md: 0 3px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.5), 0 6px 6px rgba(0, 0, 0, 0.4);
  --shadow-menu: 0 5px 5px -3px rgba(0, 0, 0, 0.4), 0 8px 10px 1px rgba(0, 0, 0, 0.3), 0 3px 14px 2px rgba(0, 0, 0, 0.26);
  --shadow-panel: 0 8px 10px -5px rgba(0, 0, 0, 0.4), 0 16px 24px 2px rgba(0, 0, 0, 0.3), 0 6px 30px 5px rgba(0, 0, 0, 0.26);

  --scrollbar-track: #1e1e1e;
  --scrollbar-thumb: #424242;
  --scrollbar-thumb-hover: #616161;
  --overlay-scrim: rgba(0, 0, 0, 0.7);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes dropdownFadeIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes toastIn {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dialogScaleIn {
  from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes fadeInDown {
  from { transform: translate(-50%, -20px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}

@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
`;

fs.writeFileSync(path.join(srcDir, 'variables.css'), variablesCss);
console.log('Wrote variables.css');

// Order of files matching dxfviewer
const order = [
  'variables',
  'reset',
  'layout',
  'toolbar',
  'panel',
  'statusBar',
  'tabs',
  'canvas',
  'overlays',
  'search',
  'components'
];

let indexImports = "@import './variables.css';\n";

for (const name of order) {
  if (name === 'variables') continue;
  const blocks = categories[name] || [];
  const fileName = `${name}.css`;
  fs.writeFileSync(path.join(srcDir, fileName), blocks.join('\n\n') + '\n');
  indexImports += `@import './${fileName}';\n`;
  console.log(`Wrote ${blocks.length} blocks to ${fileName}`);
}

fs.writeFileSync(path.join(srcDir, 'index.css'), indexImports);
console.log('Successfully updated index.css with modular @imports!');
