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

export const themes: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        bg: "#e8ebef",
        panelBg: "#ffffff",
        headerBg: "#f0f2f5",
        border: "#cdd3da",
        text: "#14181d",
        textLight: "#14181d",
        textMuted: "#5c636c",
        accent: "#0b5fa5",
        highlight: "#e3eef9",
        itemHover: "#e3e8ee",
        success: "#0b6b3a",
        warning: "#8a5b00",
        danger: "#b3261e",
        canvasBg: "#eef1f5",
        shadow: "0 1px 2px rgba(0, 0, 0, 0.08)"
    },
    dark: {
        bg: "#0e1114",
        panelBg: "#181d23",
        headerBg: "#21272f",
        border: "#39434e",
        text: "#f1f4f7",
        textLight: "#ffffff",
        textMuted: "#98a3af",
        accent: "#6fb3e6",
        highlight: "#17364e",
        itemHover: "#2b333c",
        success: "#58b97d",
        warning: "#e0b45c",
        danger: "#ef6a60",
        canvasBg: "#12171c",
        shadow: "0 1px 2px rgba(0, 0, 0, 0.6)"
    }
};

export const DEFAULT_FONT = '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

export const colors = themes.light;

function readCssVar(name: string) {
    if (typeof window === "undefined") return "";
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue(name).trim();
}

export function resolveThemeColors(): ThemeColors {
    const isDark = typeof document !== "undefined" && (
        document.documentElement.classList.contains("theme-dark") ||
        document.documentElement.getAttribute("data-theme") === "dark"
    );
    const fallback = isDark ? themes.dark : themes.light;
    const vars = {
        bg: readCssVar("--bg-primary"),
        panelBg: readCssVar("--bg-panel"),
        headerBg: readCssVar("--bg-header"),
        border: readCssVar("--border-color"),
        text: readCssVar("--text-primary"),
        textLight: isDark ? "#ffffff" : "#000000",
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

