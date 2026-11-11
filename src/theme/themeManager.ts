/**
 * 主题管理器
 * 默认主题（经典蓝）完全使用 :root 中的设计令牌；
 * 其余主题色只覆盖强调色令牌，布局与灰阶保持不变。
 */

export type ThemeType = "indigo" | "sky" | "emerald" | "violet" | "rose" | "amber" | "custom";
export type ThemeMode = "light" | "dark";

export interface ThemePreset {
  key: ThemeType;
  labelZh: string;
  labelEn: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryContainer: string;
  primaryLine: string;
  swatch: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "indigo",
    labelZh: "经典蓝",
    labelEn: "Classic",
    primary: "#0b5fa5",
    primaryHover: "#094e88",
    primaryActive: "#083f6d",
    primaryContainer: "#e3eef9",
    primaryLine: "#8fbde6",
    swatch: "#0b5fa5"
  },
  {
    key: "sky",
    labelZh: "天蓝",
    labelEn: "Sky",
    primary: "#0f6cbd",
    primaryHover: "#0d5a9e",
    primaryActive: "#0a487d",
    primaryContainer: "#e5f0fa",
    primaryLine: "#8fc0e8",
    swatch: "#0f6cbd"
  },
  {
    key: "emerald",
    labelZh: "墨绿",
    labelEn: "Green",
    primary: "#0b6b3a",
    primaryHover: "#095a31",
    primaryActive: "#074726",
    primaryContainer: "#e6f3ec",
    primaryLine: "#8fc8a9",
    swatch: "#0b6b3a"
  },
  {
    key: "violet",
    labelZh: "紫罗兰",
    labelEn: "Violet",
    primary: "#5b3a9e",
    primaryHover: "#4c3085",
    primaryActive: "#3d266b",
    primaryContainer: "#eee9f8",
    primaryLine: "#b6a4dd",
    swatch: "#5b3a9e"
  },
  {
    key: "rose",
    labelZh: "桃红",
    labelEn: "Rose",
    primary: "#ad1457",
    primaryHover: "#8e1046",
    primaryActive: "#740d3a",
    primaryContainer: "#fbe9f1",
    primaryLine: "#e5a3c0",
    swatch: "#ad1457"
  },
  {
    key: "amber",
    labelZh: "暖橙",
    labelEn: "Amber",
    primary: "#8a5b00",
    primaryHover: "#744c00",
    primaryActive: "#5e3d00",
    primaryContainer: "#fbf2e2",
    primaryLine: "#dcc08a",
    swatch: "#8a5b00"
  },
];

/**
 * 从 hex 色值推导一套完整的主题变量
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** 把 a 与 b 按 t（0~1）混合，t=0 返回 a */
function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ca.r, cb.r)}${ch(ca.g, cb.g)}${ch(ca.b, cb.b)}`;
}

/** 相对亮度（sRGB 线性化） */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** 白字对比度 */
function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/** 保证实底强调色承载白字时对比度 ≥ 4.6:1 */
function ensureWhiteText(hex: string): string {
  let color = hex;
  let guard = 0;
  while (contrastWithWhite(color) < 4.6 && guard < 16) {
    color = darken(color, 0.08);
    guard++;
  }
  return color;
}

function rgbaOf(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : hex;
}

function buildCustomPreset(hex: string): ThemePreset {
  return {
    key: "custom",
    labelZh: "自定义",
    labelEn: "Custom",
    primary: hex,
    primaryHover: darken(hex, 0.14),
    primaryActive: darken(hex, 0.26),
    primaryContainer: lighten(hex, 0.9),
    primaryLine: lighten(hex, 0.52),
    swatch: hex,
  };
}

/**
 * 将主题模式（明亮/暗黑）应用到 html 根节点
 */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = mode === "dark";
  root.classList.toggle("theme-dark", isDark);
  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
}

const THEME_VARS = [
  "accent",
  "accent-hover",
  "accent-active",
  "accent-soft",
  "accent-line",
  "accent-focus",
  "accent-solid",
  "accent-solid-hover",
  "accent-solid-active",
  "accent-subtle",
  "accent-blue",
  "accent-blue-hover",
  "accent-blue-soft",
  "primary",
  "primary-hover",
  "primary-active",
  "primary-container",
  "primary-focus",
  "surface-hover",
  "surface-active",
  "surface-selected",
  "surface-soft",
  "surface-soft-strong"
] as const;

/**
 * 将主题应用到 :root CSS 变量。
 * 默认主题不写内联变量，直接使用 variables.css 中的令牌真值。
 * 主题色需要覆盖全部强调相关令牌（含实底强调 accent-solid*），保证
 * 工具栏开启态、主按钮、开关、复选框等与文本强调色同色，不出现“蓝色按钮 + 主题色文字”。
 */
export function applyTheme(type: ThemeType, customColor?: string, mode?: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode) {
    applyThemeMode(mode);
  }

  const root = document.documentElement;

  if (!type || type === "indigo") {
    THEME_VARS.forEach((name) => root.style.removeProperty(`--${name}`));
    return;
  }

  const preset = type === "custom" && customColor
    ? buildCustomPreset(customColor)
    : THEME_PRESETS.find((p) => p.key === type);

  if (!preset) {
    THEME_VARS.forEach((name) => root.style.removeProperty(`--${name}`));
    return;
  }

  const isDark = (mode ?? "light") === "dark";

  // 深色主题下：文本强调色需要提亮，浅色容器需要压暗渐变；
  // 实底强调色必须保持足够深以承载白字。
  const accent = isDark ? lighten(preset.primary, 0.45) : preset.primary;
  const accentHover = isDark ? lighten(preset.primary, 0.58) : preset.primaryHover;
  const accentActive = isDark ? lighten(preset.primary, 0.32) : preset.primaryActive;
  const accentSoft = isDark ? mix(preset.primary, "#1e242b", 0.2) : preset.primaryContainer;
  const accentLine = isDark ? lighten(preset.primary, 0.28) : preset.primaryLine;
  const accentFocus = isDark ? rgbaOf(accent, 0.4) : rgbaOf(preset.primary, 0.22);

  const accentSolid = ensureWhiteText(preset.primary);
  const accentSolidHover = isDark
    ? ensureWhiteText(lighten(accentSolid, 0.12))
    : ensureWhiteText(preset.primaryHover);
  const accentSolidActive = isDark ? darken(accentSolid, 0.12) : ensureWhiteText(preset.primaryActive);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-hover", accentHover);
  root.style.setProperty("--accent-active", accentActive);
  root.style.setProperty("--accent-soft", accentSoft);
  root.style.setProperty("--accent-line", accentLine);
  root.style.setProperty("--accent-focus", accentFocus);
  root.style.setProperty("--accent-solid", accentSolid);
  root.style.setProperty("--accent-solid-hover", accentSolidHover);
  root.style.setProperty("--accent-solid-active", accentSolidActive);
  root.style.setProperty("--accent-subtle", accentSoft);
  root.style.setProperty("--accent-blue", accent);
  root.style.setProperty("--accent-blue-hover", accentHover);
  root.style.setProperty("--accent-blue-soft", accentSoft);

  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-hover", accentHover);
  root.style.setProperty("--primary-active", accentActive);
  root.style.setProperty("--primary-container", accentSoft);
  root.style.setProperty("--primary-focus", accentFocus);

  // hover 保持中性灰（不随主题染色），避免深色下出现浅色悬停块
  root.style.removeProperty("--surface-hover");
  root.style.removeProperty("--surface-active");
  root.style.setProperty("--surface-selected", accentSoft);
  root.style.setProperty("--surface-soft", accentSoft);
  root.style.setProperty("--surface-soft-strong", accentSoft);
}