import React from "react";
import { isMenuHidden } from "./menu/utils";
import {
    IconRuler,
    IconTarget,
    IconScissors,
    IconCamera,
    IconSearch,
    IconSelectAll,
    IconWrench,
    IconImage,
    IconExplode,
    IconChevronDown
} from "../theme/Icons";

/**
 * 底部居中工具坞（MD3 胶囊浮条）：
 * 设置中把工具栏位置切到「底部居中」时承载全部工具；可整体收起为单个圆形按钮。
 *
 * 两种呈现（st_tools_dock_labels 设置）：
 *  - 仅图标：紧凑方胶囊，靠 tooltip 说明
 *  - 图标 + 文字：上图标下文字，无需记忆图标含义（默认）
 */
export interface ToolsDockProps {
    t: (key: string) => string;
    theme?: any;
    activeTool?: string;
    setActiveTool?: (tool: any) => void;
    hiddenMenus?: string[];
    collapsed: boolean;
    onToggleCollapsed: () => void;
    /** 是否显示文字标签（上图标下文字） */
    showLabels?: boolean;
}

export const ToolsDock: React.FC<ToolsDockProps> = ({
    t,
    activeTool,
    setActiveTool,
    hiddenMenus = [],
    collapsed,
    onToggleCollapsed,
    showLabels = true
}) => {
    const hidden = (id: string) => isMenuHidden(hiddenMenus, id);

    const toggleTool = (tool: string) => {
        setActiveTool?.(activeTool === tool ? "none" : tool);
    };

    const toolButton = (id: string, icon: React.ReactNode, label: string, tool: string) =>
        hidden(id) ? null : (
            <button
                type="button"
                className={
                    "ui-tools-dock-btn" +
                    (activeTool === tool ? " active" : "") +
                    (showLabels ? " with-label" : "")
                }
                onClick={() => toggleTool(tool)}
                title={label}
                aria-label={label}
                aria-pressed={activeTool === tool}
            >
                <span className="ui-tools-dock-icon" aria-hidden="true">{icon}</span>
                {showLabels && <span className="ui-tools-dock-label">{label}</span>}
            </button>
        );

    if (collapsed) {
        return (
            <div className="ui-tools-dock ui-tools-dock-collapsed">
                <button
                    type="button"
                    className="ui-tools-dock-fab"
                    onClick={onToggleCollapsed}
                    title={t("ui_expand")}
                    aria-label={t("ui_expand")}
                >
                    <IconWrench size={16} />
                </button>
            </div>
        );
    }

    return (
        <div
            className={"ui-tools-dock" + (showLabels ? " ui-tools-dock-with-labels" : "")}
            role="toolbar"
            aria-label={t("tb_tools")}
        >
            {toolButton("measure", <IconRuler />, t("tb_measure"), "measure")}
            {toolButton("boxSelect", <IconSelectAll />, t("tb_boxSelect"), "boxSelect")}
            {toolButton("clip", <IconScissors />, t("tb_clip"), "clip")}
            {toolButton("viewpoint", <IconCamera />, t("viewpoint_default_name"), "viewpoint")}
            {toolButton("screenshot", <IconImage />, t("tb_screenshot"), "screenshot")}
            {toolButton("search", <IconSearch />, t("tb_search"), "search")}
            {toolButton("clash", <IconTarget />, t("tb_clash"), "clash")}
            {toolButton("explode", <IconExplode />, t("tb_explode"), "explode")}

            <div className="ui-tools-dock-divider" aria-hidden="true" />

            <button
                type="button"
                className={"ui-tools-dock-toggle" + (showLabels ? " with-label" : "")}
                onClick={onToggleCollapsed}
                title={t("ui_collapse")}
                aria-label={t("ui_collapse")}
            >
                <span className="ui-tools-dock-icon" aria-hidden="true"><IconChevronDown size={14} /></span>
                {showLabels && <span className="ui-tools-dock-label">{t("ui_collapse")}</span>}
            </button>
        </div>
    );
};
