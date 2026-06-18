/**
 * 主题管理器
 * 内置多套主题色，支持自定义色
 */

export type ThemeType = "indigo" | "sky" | "emerald" | "violet" | "rose" | "amber" | "custom";

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
    labelZh: "靛蓝",
    labelEn: "Indigo",
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    primaryActive: "#3730a3",
    primaryContainer: "#ede9fe",
    surfaceHover: "rgba(79, 70, 229, 0.05)",
    surfaceActive: "rgba(79, 70, 229, 0.10)",
    surfaceSelected: "rgba(79, 70, 229, 0.08)",
    surfaceSoft: "#f5f3ff",
    surfaceSoftStrong: "#ede9fe",
    swatch: "#4f46e5",
  },
  {
    key: "sky",
    labelZh: "天蓝",
    labelEn: "Sky",
    primary: "#0284c7",
    primaryHover: "#0369a1",
    primaryActive: "#075985",
    primaryContainer: "#e0f2fe",
    surfaceHover: "rgba(2, 132, 199, 0.05)",
    surfaceActive: "rgba(2, 132, 199, 0.10)",
    surfaceSelected: "rgba(2, 132, 199, 0.08)",
    surfaceSoft: "#f0f9ff",
    surfaceSoftStrong: "#e0f2fe",
    swatch: "#0284c7",
  },
  {
    key: "emerald",
    labelZh: "翠绿",
    labelEn: "Emerald",
    primary: "#059669",
    primaryHover: "#047857",
    primaryActive: "#065f46",
    primaryContainer: "#d1fae5",
    surfaceHover: "rgba(5, 150, 105, 0.05)",
    surfaceActive: "rgba(5, 150, 105, 0.10)",
    surfaceSelected: "rgba(5, 150, 105, 0.08)",
    surfaceSoft: "#ecfdf5",
    surfaceSoftStrong: "#d1fae5",
    swatch: "#059669",
  },
  {
    key: "violet",
    labelZh: "紫罗兰",
    labelEn: "Violet",
    primary: "#7c3aed",
    primaryHover: "#6d28d9",
    primaryActive: "#5b21b6",
    primaryContainer: "#ede9fe",
    surfaceHover: "rgba(124, 58, 237, 0.05)",
    surfaceActive: "rgba(124, 58, 237, 0.10)",
    surfaceSelected: "rgba(124, 58, 237, 0.08)",
    surfaceSoft: "#f5f3ff",
    surfaceSoftStrong: "#ede9fe",
    swatch: "#7c3aed",
  },
  {
    key: "rose",
    labelZh: "玫红",
    labelEn: "Rose",
    primary: "#e11d48",
    primaryHover: "#be123c",
    primaryActive: "#9f1239",
    primaryContainer: "#ffe4e6",
    surfaceHover: "rgba(225, 29, 72, 0.05)",
    surfaceActive: "rgba(225, 29, 72, 0.10)",
    surfaceSelected: "rgba(225, 29, 72, 0.08)",
    surfaceSoft: "#fff1f2",
    surfaceSoftStrong: "#ffe4e6",
    swatch: "#e11d48",
  },
  {
    key: "amber",
    labelZh: "琥珀",
    labelEn: "Amber",
    primary: "#d97706",
    primaryHover: "#b45309",
    primaryActive: "#92400e",
    primaryContainer: "#fef3c7",
    surfaceHover: "rgba(217, 119, 6, 0.05)",
    surfaceActive: "rgba(217, 119, 6, 0.10)",
    surfaceSelected: "rgba(217, 119, 6, 0.08)",
    surfaceSoft: "#fffbeb",
    surfaceSoftStrong: "#fef3c7",
    swatch: "#d97706",
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
 * 将主题应用到 :root CSS 变量
 */
export function applyTheme(type: ThemeType, customColor?: string): void {
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

  // focus ring
  const rgb = hexToRgb(preset.primary);
  if (rgb) {
    root.style.setProperty(
      "--primary-focus",
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`
    );
  }
}
