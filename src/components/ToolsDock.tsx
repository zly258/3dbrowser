import React from "react";
import { ImageButton } from "./common/ImageButton";
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
    IconChevronDown,
    IconChevronUp
} from "../theme/Icons";

/**
 * 底部居中工具坞（MD3 胶囊浮条）：
 * 设置中把工具栏位置切到「底部居中」时承载全部工具；可整体收起为单个圆形按钮。
 */
export interface ToolsDockProps {
    t: (key: string) => string;
    theme?: any;
    activeTool?: string;
    setActiveTool?: (tool: any) => void;
    hiddenMenus?: string[];
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

export const ToolsDock: React.FC<ToolsDockProps> = ({
    t,
    theme,
    activeTool,
    setActiveTool,
    hiddenMenus = [],
    collapsed,
    onToggleCollapsed
}) => {
    const hidden = (id: string) => isMenuHidden(hiddenMenus, id);

    const toggleTool = (tool: NonNullable<string>) => {
        setActiveTool?.(activeTool === tool ? "none" : tool);
    };

    const toolButton = (id: string, icon: React.ReactNode, label: string, tool: string) =>
        hidden(id) ? null : (
            <ImageButton
                icon={icon}
                className="ui-tools-dock-btn"
                active={activeTool === tool}
                onClick={() => toggleTool(tool)}
                theme={theme}
                title={label}
                aria-label={label}
            />
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
        <div className="ui-tools-dock" role="toolbar" aria-label={t("tb_tools")}>
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
                className="ui-tools-dock-toggle"
                onClick={onToggleCollapsed}
                title={t("ui_collapse")}
                aria-label={t("ui_collapse")}
            >
                <IconChevronDown size={14} />
            </button>
        </div>
    );
};
