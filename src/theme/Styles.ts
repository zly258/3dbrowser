
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

export const themes: Record<'dark' | 'light', ThemeColors> = {
    dark: {
        bg: "#1f2227",
        panelBg: "#282c31",
        headerBg: "#32363d",
        border: "#444b55",
        text: "#f1f1f1",
        textLight: "#ffffff",
        textMuted: "#999999",
        accent: "#007acc", 
        highlight: "#3e3e42",
        itemHover: "rgba(255, 255, 255, 0.1)",
        success: "#4ec9b0",
        warning: "#ce9178",
        danger: "#f48771",
        canvasBg: "#2a2f36",
        shadow: "rgba(0, 0, 0, 0.5)"
    },
    light: {
        bg: "#ffffff", // 办公风格白色
        panelBg: "#ffffff",
        headerBg: "#f4f5f7", // 标签区域浅灰
        border: "#d2d2d2", // 办公风格边框色
        text: "#444444",
        textLight: "#000000",
        textMuted: "#666666",
        accent: "#2b579a", // 办公风格蓝（文字应用风格）
        highlight: "#cfe3ff",
        itemHover: "#e1e1e1",
        success: "#217346", // 成功绿
        warning: "#d24726", // 警告橙
        danger: "#a4262c",
        canvasBg: "#eef1f4",
        shadow: "rgba(0, 0, 0, 0.15)"
    }
};

export const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";

export const colors = themes.dark;
