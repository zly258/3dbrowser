export interface ThemeColors {
    bg: string;
    panelBg: string;
    headerBg: string;
    border: string;
    text: string;
    textLight: string;
    textMuted: string;
    accent: string;
    highlight: string;
    itemHover: string;
    success: string;
    warning: string;
    danger: string;
    canvasBg: string;
    shadow: string;
}

export const themes: { light: ThemeColors } = {
    light: {
        bg: "#f8fafc",
        panelBg: "#ffffff",
        headerBg: "#f1f5f9",
        border: "#e2e8f0",
        text: "#0f172a",
        textLight: "#0f172a",
        textMuted: "#64748b",
        accent: "#4f46e5",
        highlight: "rgba(79, 70, 229, 0.08)",
        itemHover: "rgba(79, 70, 229, 0.05)",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        canvasBg: "#ffffff",
        shadow: "rgba(15, 23, 42, 0.08)"
    }
};

export const DEFAULT_FONT = "'Plus Jakarta Sans', 'Inter', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

export const colors = themes.light;

function readCssVar(name: string) {
    if (typeof window === "undefined") return "";
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue(name).trim();
}

export function resolveThemeColors(): ThemeColors {
    const fallback = themes.light;
    const vars = {
        bg: readCssVar("--bg-primary"),
        panelBg: readCssVar("--bg-panel"),
        headerBg: readCssVar("--bg-header"),
        border: readCssVar("--border-color"),
        text: readCssVar("--text-primary"),
        textLight: "#000000",
        textMuted: readCssVar("--text-muted"),
        accent: readCssVar("--accent"),
        highlight: readCssVar("--bg-selected"),
        itemHover: readCssVar("--bg-hover"),
        success: readCssVar("--success"),
        warning: readCssVar("--warning"),
        danger: readCssVar("--error"),
        canvasBg: readCssVar("--bg-canvas"),
        shadow: readCssVar("--shadow-md")
    };

    return {
        bg: vars.bg || fallback.bg,
        panelBg: vars.panelBg || fallback.panelBg,
        headerBg: vars.headerBg || fallback.headerBg,
        border: vars.border || fallback.border,
        text: vars.text || fallback.text,
        textLight: vars.textLight || fallback.textLight,
        textMuted: vars.textMuted || fallback.textMuted,
        accent: vars.accent || fallback.accent,
        highlight: vars.highlight || fallback.highlight,
        itemHover: vars.itemHover || fallback.itemHover,
        success: vars.success || fallback.success,
        warning: vars.warning || fallback.warning,
        danger: vars.danger || fallback.danger,
        canvasBg: vars.canvasBg || fallback.canvasBg,
        shadow: vars.shadow || fallback.shadow
    };
}
