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
        bg: "#fafafa",
        panelBg: "#ffffff",
        headerBg: "#f5f5f5",
        border: "rgba(0, 0, 0, 0.12)",
        text: "rgba(0, 0, 0, 0.87)",
        textLight: "#000000",
        textMuted: "rgba(0, 0, 0, 0.38)",
        accent: "#1976d2",
        highlight: "rgba(25, 118, 210, 0.12)",
        itemHover: "rgba(0, 0, 0, 0.04)",
        success: "#2e7d32",
        warning: "#f9a825",
        danger: "#d32f2f",
        canvasBg: "#fafafa",
        shadow: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)"
    },
    dark: {
        bg: "#121212",
        panelBg: "#1e1e1e",
        headerBg: "#262626",
        border: "rgba(255, 255, 255, 0.12)",
        text: "rgba(255, 255, 255, 0.87)",
        textLight: "#ffffff",
        textMuted: "rgba(255, 255, 255, 0.38)",
        accent: "#90caf9",
        highlight: "rgba(144, 202, 249, 0.16)",
        itemHover: "rgba(255, 255, 255, 0.04)",
        success: "#81c784",
        warning: "#fff176",
        danger: "#ef9a9a",
        canvasBg: "#121212",
        shadow: "0 1px 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.6)"
    }
};

export const DEFAULT_FONT = "'Roboto', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', Arial, sans-serif";

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
