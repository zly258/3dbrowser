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
export declare const themes: Record<'dark' | 'light', ThemeColors>;
export declare const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";
export declare const colors: ThemeColors;
