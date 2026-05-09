import React from "react";
import { ThemeColors } from "../../theme/styles";

export type ThemeType = "light";

export type MenuTool =
    | "none"
    | "measure"
    | "clip"
    | "settings"
    | "export"
    | "screenshot"
    | "viewpoint"
    | "search"
    | "boxSelect"
    | "explode"
    | "clash"
    | "sun";

export type DisplayMode = "solid" | "transparent";

export interface BaseMenuProps {
    t: (key: string) => string;
    theme: ThemeColors;
    hiddenMenus?: string[];
    handleOpenFiles?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleBatchConvert?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleOpenUrl?: () => void;
    handleView?: (view: string) => void;
    handleClear?: () => void;
    pickEnabled?: boolean;
    setPickEnabled?: (enabled: boolean) => void;
    activeTool?: MenuTool;
    setActiveTool?: (tool: MenuTool) => void;
    showOutline?: boolean;
    setShowOutline?: (show: boolean) => void;
    showProps?: boolean;
    setShowProps?: (show: boolean) => void;
    showStats?: boolean;
    setShowStats?: (show: boolean) => void;
    sceneMgr?: any;
    onOpenAbout?: () => void;
    hasModels?: boolean;
}

export interface ClassicMenuBarProps extends BaseMenuProps {
    themeType?: ThemeType;
    setThemeType?: (type: ThemeType) => void;
}

export interface ToolbarProps extends BaseMenuProps {
    openScreenshotPanel?: () => void;
    handleDisplayModeChange?: (mode: DisplayMode) => void;
    displayMode?: DisplayMode;
}
