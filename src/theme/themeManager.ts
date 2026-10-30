/**
 * 主题管理器
 * 内置多套主题色，支持自定义色
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
  surfaceHover: string;
  surfaceActive: string;
  surfaceSelected: string;
  surfaceSoft: string;
  surfaceSoftStrong: string;
  swatch: string; // color shown in UI swatch
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "indigo",
    labelZh: "经典蓝",
    labelEn: "Blue",
    primary: "#1976d2",
    primaryHover: "#1565c0",
    primaryActive: "#0d47a1",
    primaryContainer: "rgba(25, 118, 210, 0.12)",
    surfaceHover: "rgba(25, 118, 210, 0.04)",
    surfaceActive: "rgba(25, 118, 210, 0.12)",
    surfaceSelected: "rgba(25, 118, 210, 0.12)",
    surfaceSoft: "rgba(25, 118, 210, 0.08)",
    surfaceSoftStrong: "rgba(25, 118, 210, 0.14)",
    swatch: "#1976d2",
  },
  {
    key: "sky",
    labelZh: "天蓝",
    labelEn: "Sky",
    primary: "#0288d1",
    primaryHover: "#0277bd",
    primaryActive: "#01579b",
    primaryContainer: "rgba(2, 136, 209, 0.12)",
    surfaceHover: "rgba(2, 136, 209, 0.04)",
    surfaceActive: "rgba(2, 136, 209, 0.12)",
    surfaceSelected: "rgba(2, 136, 209, 0.12)",
    surfaceSoft: "rgba(2, 136, 209, 0.08)",
    surfaceSoftStrong: "rgba(2, 136, 209, 0.14)",
    swatch: "#0288d1",
  },
  {
    key: "emerald",
    labelZh: "墨绿",
    labelEn: "Green",
    primary: "#2e7d32",
    primaryHover: "#1b5e20",
    primaryActive: "#0d4013",
    primaryContainer: "rgba(46, 125, 50, 0.12)",
    surfaceHover: "rgba(46, 125, 50, 0.04)",
    surfaceActive: "rgba(46, 125, 50, 0.12)",
    surfaceSelected: "rgba(46, 125, 50, 0.12)",
    surfaceSoft: "rgba(46, 125, 50, 0.08)",
    surfaceSoftStrong: "rgba(46, 125, 50, 0.14)",
    swatch: "#2e7d32",
  },
  {
    key: "violet",
    labelZh: "紫罗兰",
    labelEn: "Violet",
    primary: "#512da8",
    primaryHover: "#4527a0",
    primaryActive: "#311b92",
    primaryContainer: "rgba(81, 45, 168, 0.12)",
    surfaceHover: "rgba(81, 45, 168, 0.04)",
    surfaceActive: "rgba(81, 45, 168, 0.12)",
    surfaceSelected: "rgba(81, 45, 168, 0.12)",
    surfaceSoft: "rgba(81, 45, 168, 0.08)",
    surfaceSoftStrong: "rgba(81, 45, 168, 0.14)",
    swatch: "#512da8",
  },
  {
    key: "rose",
    labelZh: "桃红",
    labelEn: "Rose",
    primary: "#c2185b",
    primaryHover: "#ad1457",
    primaryActive: "#880e4f",
    primaryContainer: "rgba(194, 24, 91, 0.12)",
    surfaceHover: "rgba(194, 24, 91, 0.04)",
    surfaceActive: "rgba(194, 24, 91, 0.12)",
    surfaceSelected: "rgba(194, 24, 91, 0.12)",
    surfaceSoft: "rgba(194, 24, 91, 0.08)",
    surfaceSoftStrong: "rgba(194, 24, 91, 0.14)",
    swatch: "#c2185b",
  },
  {
    key: "amber",
    labelZh: "暖橙",
    labelEn: "Amber",
    primary: "#f57c00",
    primaryHover: "#ef6c00",
    primaryActive: "#e65100",
    primaryContainer: "rgba(245, 124, 0, 0.12)",
    surfaceHover: "rgba(245, 124, 0, 0.04)",
    surfaceActive: "rgba(245, 124, 0, 0.12)",
    surfaceSelected: "rgba(245, 124, 0, 0.12)",
    surfaceSoft: "rgba(245, 124, 0, 0.08)",
    surfaceSoftStrong: "rgba(245, 124, 0, 0.14)",
    swatch: "#f57c00",
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
  const rgb = hexToRgb(hex);
  const r = rgb?.r ?? 79;
  const g = rgb?.g ?? 70;
  const b = rgb?.b ?? 229;
  return {
    key: "custom",
    labelZh: "自定义",
    labelEn: "Custom",
    primary: hex,
    primaryHover: darken(hex, 0.12),
    primaryActive: darken(hex, 0.22),
    primaryContainer: lighten(hex, 0.88),
    surfaceHover: `rgba(${r}, ${g}, ${b}, 0.05)`,
    surfaceActive: `rgba(${r}, ${g}, ${b}, 0.10)`,
    surfaceSelected: `rgba(${r}, ${g}, ${b}, 0.08)`,
    surfaceSoft: lighten(hex, 0.94),
    surfaceSoftStrong: lighten(hex, 0.88),
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

/**
 * 将主题应用到 :root CSS 变量
 */
export function applyTheme(type: ThemeType, customColor?: string, mode?: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode) {
    applyThemeMode(mode);
  }

  let preset: ThemePreset | undefined;

  if (type === "custom" && customColor) {
    preset = buildCustomPreset(customColor);
  } else {
    preset = THEME_PRESETS.find((p) => p.key === type);
  }

  if (!preset) {
    preset = THEME_PRESETS[0];
  }

  const root = document.documentElement;
  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--primary-hover", preset.primaryHover);
  root.style.setProperty("--primary-active", preset.primaryActive);
  root.style.setProperty("--primary-container", preset.primaryContainer);
  root.style.setProperty("--surface-hover", preset.surfaceHover);
  root.style.setProperty("--surface-active", preset.surfaceActive);
  root.style.setProperty("--surface-selected", preset.surfaceSelected);
  root.style.setProperty("--surface-soft", preset.surfaceSoft);
  root.style.setProperty("--surface-soft-strong", preset.surfaceSoftStrong);

  // 同步历史/兼容变量 --accent 体系与 --accent-blue
  root.style.setProperty("--accent", preset.primary);
  root.style.setProperty("--accent-hover", preset.primaryHover);
  root.style.setProperty("--accent-active", preset.primaryActive);
  root.style.setProperty("--accent-subtle", preset.primaryContainer);
  if (preset.key === "indigo") {
    root.style.setProperty("--accent-blue", preset.primary);
    root.style.setProperty("--accent-blue-hover", preset.primaryHover);
    root.style.setProperty("--accent-blue-soft", preset.primaryContainer);
  }

  // focus ring
  const rgb = hexToRgb(preset.primary);
  if (rgb) {
    const focusVal = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`;
    root.style.setProperty("--primary-focus", focusVal);
    root.style.setProperty("--accent-focus", focusVal);
  }
}
