import React from "react";
import { ThemeColors } from "../../theme/styles";
import type { DisplayMode } from "../../utils/scene-manager/displayMode";

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

export type { DisplayMode };

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
    /** 工具栏位置：top = 顶栏「工具」下拉（默认）；bottom = 底部居中工具坞 */
    toolsDock?: "top" | "bottom";
}
