
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
        bg: "#F8FAFF",
        panelBg: "#FFFFFF",
        headerBg: "#E0E2EC",
        border: "#d2d2d2",
        text: "#1C1B1F",
        textLight: "#000000",
        textMuted: "#49454F",
        accent: "#0c62a2",
        highlight: "#E0E2EC",
        itemHover: "rgba(12, 98, 162, 0.08)",
        success: "#217346",
        warning: "#CA8A04",
        danger: "#B3261E",
        canvasBg: "#FFFFFF",
        shadow: "rgba(0, 0, 0, 0.15)"
    }
};

export const DEFAULT_FONT = "'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

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
