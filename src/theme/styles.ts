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

/* 与 src/styles/variables.css 的 MD3 令牌保持一致（仅作 CSS 变量读取失败时的回退） */
export const themes: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        bg: "#f8fafc",
        panelBg: "#ffffff",
        headerBg: "#ffffff",
        border: "#e2e8f0",
        text: "#1e293b",
        textLight: "#1e293b",
        textMuted: "#5b6472",
        accent: "#2563eb",
        highlight: "#eff6ff",
        itemHover: "#f1f5f9",
        success: "#15803d",
        warning: "#b45309",
        danger: "#b3261e",
        canvasBg: "#f8fafc",
        shadow: "0 1px 2px rgba(15, 23, 42, 0.06)"
    },
    dark: {
        bg: "#0f172a",
        panelBg: "#1e293b",
        headerBg: "#1e293b",
        border: "#334155",
        text: "#f1f5f9",
        textLight: "#ffffff",
        textMuted: "#94a3b8",
        accent: "#60a5fa",
        highlight: "#1c3557",
        itemHover: "#2b3a54",
        success: "#4ade80",
        warning: "#fbbf24",
        danger: "#f87171",
        canvasBg: "#0b1220",
        shadow: "0 1px 2px rgba(0, 0, 0, 0.5)"
    }
};

export const DEFAULT_FONT = "'Nunito', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif";

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
