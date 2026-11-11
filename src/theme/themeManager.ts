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

  const rgb = hexToRgb(preset.primary);
  const focus = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)` : preset.primaryContainer;

  root.style.setProperty("--accent", preset.primary);
  root.style.setProperty("--accent-hover", preset.primaryHover);
  root.style.setProperty("--accent-active", preset.primaryActive);
  root.style.setProperty("--accent-soft", preset.primaryContainer);
  root.style.setProperty("--accent-line", preset.primaryLine);
  root.style.setProperty("--accent-focus", focus);
  root.style.setProperty("--accent-subtle", preset.primaryContainer);
  root.style.setProperty("--accent-blue", preset.primary);
  root.style.setProperty("--accent-blue-hover", preset.primaryHover);
  root.style.setProperty("--accent-blue-soft", preset.primaryContainer);

  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--primary-hover", preset.primaryHover);
  root.style.setProperty("--primary-active", preset.primaryActive);
  root.style.setProperty("--primary-container", preset.primaryContainer);
  root.style.setProperty("--primary-focus", focus);

  root.style.setProperty("--surface-hover", preset.primaryContainer);
  root.style.setProperty("--surface-active", preset.primaryContainer);
  root.style.setProperty("--surface-selected", preset.primaryContainer);
  root.style.setProperty("--surface-soft", preset.primaryContainer);
  root.style.setProperty("--surface-soft-strong", preset.primaryContainer);
}