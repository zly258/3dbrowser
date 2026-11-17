import React, { useEffect, useRef, useState } from "react";
import { ImageButton } from "../common/ImageButton";
import { SegmentedControl } from "../common";
import { ToolbarProps } from "./types";
import type { DisplayMode } from "../../utils/scene-manager/displayMode";
import { cx, isMenuHidden } from "./utils";
import {
    IconFile,
    IconMaximize,
    IconRuler,
    IconTarget,
    IconScissors,
    IconSettings,
    IconInfo,
    IconMousePointer,
    IconMenu,
    IconList,
    IconCamera,
    IconSearch,
    IconSelectAll,
    IconWrench,
    IconImage,
    IconExplode,
    IconOpenFile,
    IconExportScene,
    IconClear
} from "../../theme/Icons";

/**
 * 顶栏（MD3 语言）：左「模型开关 + 品牌 + 文件 + 充满」｜中「显示样式分段」｜右「选择 + 工具 + 搜索/设置/关于 + 属性开关」。
 * 模型（左栏）/属性（右栏）为边缘图标开关（与参考 dxfviewer 一致）；
 * 正交/轴测视角由视口内的 ViewCube 承担，顶栏不再提供视图菜单；
 * 长尾工具收进「工具」下拉，且可通过设置的「工具栏位置」切到底部居中工具坞（ToolsDock）。
 */
export const Toolbar: React.FC<ToolbarProps> = (props) => {
    const {
        t,
        theme,
        hiddenMenus = []
    } = props;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const batchConvertInputRef = useRef<HTMLInputElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const hidden = (id: string) => isMenuHidden(hiddenMenus, id);

    useEffect(() => {
        if (!openMenu) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpenMenu(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openMenu]);

    const toggleMenu = (menuId: string) => {
        setOpenMenu((prev) => (prev === menuId ? null : menuId));
    };

    const closeMenu = () => setOpenMenu(null);

    const renderDropdown = (menuId: string, items: React.ReactNode) => {
        if (openMenu !== menuId) return null;

        return (
            <div className="ui-toolbar-menu" role="menu">
                {items}
            </div>
        );
    };

    const menuItem = (icon: React.ReactNode, label: string, onClick: () => void, checked?: boolean) => (
        <div
            className="ui-toolbar-menu-item"
            role={checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={checked === undefined ? undefined : checked}
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onClick();
                }
            }}
        >
            <span className="ui-toolbar-menu-icon">{icon}</span>
            <span className="ui-toolbar-menu-label">{label}</span>
            {checked !== undefined && (
                <span className={cx("ui-menu-check", "ui-toolbar-menu-check", checked && "checked")} aria-hidden="true">
                    {checked && (
                        <svg className="ui-menu-check-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </span>
            )}
        </div>
    );

    const menuDivider = () => <div className="ui-toolbar-menu-divider" />;

    const setToggleTool = (tool: NonNullable<ToolbarProps["activeTool"]>) => {
        props.setActiveTool?.(props.activeTool === tool ? "none" : tool);
    };

    /* 工具下拉内的长尾工具：激活态用对勾标记 */
    const toolMenuItem = (icon: React.ReactNode, label: string, tool: NonNullable<ToolbarProps["activeTool"]>) =>
        menuItem(icon, label, () => { setToggleTool(tool); closeMenu(); }, props.activeTool === tool);

    /* 显示样式分段（着色/真实），对齐参考中部分段切换。
       线框模式已移除：超大模型切线框会大面积只剩骨架且切换极慢，
       「真实」模式用 CAD 式棱边（圆柱竖棱、球经纬线、梁柱硬边）满足轮廓查看需求。 */
    const displayModeOptions = [
        { value: "shaded", label: t("dm_solid") },
        { value: "realistic", label: t("dm_realistic") }
    ];

    return (
        <div ref={toolbarRef} className="ui-toolbar">
            <input
                type="file"
                ref={fileInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".glb,.gltf,.ifc,.nbim,.nbip,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleOpenFiles}
            />

            <input
                type="file"
                ref={batchConvertInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleBatchConvert}
            />

            {/* ---------- 左：模型开关 + 品牌 + 文件 + 充满 ---------- */}
            <div className="ui-toolbar-left">
                {!hidden("interface") && !hidden("outline") && (
                    <ImageButton
                        icon={<IconMenu />}
                        className="ui-toolbar-btn-icononly"
                        active={props.showOutline}
                        onClick={() => props.setShowOutline?.(!props.showOutline)}
                        title={t("tb_model")}
                        aria-label={t("tb_model")}
                        theme={theme}
                    />
                )}

                <span className="ui-toolbar-brand">3D Browser</span>
                <div className="ui-toolbar-divider-vertical" aria-hidden="true" />

                {!hidden("file") && (
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconFile />}
                            label={t("tb_file")}
                            active={openMenu === "file"}
                            onClick={() => toggleMenu("file")}
                            theme={theme}
                        />

                        {renderDropdown("file", (
                            <>
                                {!hidden("open_file") && menuItem(<IconOpenFile />, t("menu_open_file"), () => {
                                    fileInputRef.current?.click();
                                    closeMenu();
                                })}

                                {!hidden("open_url") && menuItem(<IconOpenFile />, t("menu_open_url"), () => {
                                    props.handleOpenUrl?.();
                                    closeMenu();
                                })}

                                {!hidden("batch_convert") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconExportScene />, t("menu_batch_convert"), () => {
                                            batchConvertInputRef.current?.click();
                                            closeMenu();
                                        })}
                                    </>
                                )}

                                {!hidden("export") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconExportScene />, t("menu_export"), () => {
                                            props.setActiveTool?.("export");
                                            closeMenu();
                                        })}
                                    </>
                                )}

                                {!hidden("clear") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconClear />, t("op_clear"), () => {
                                            props.handleClear?.();
                                            closeMenu();
                                        })}
                                    </>
                                )}
                            </>
                        ))}
                    </div>
                )}

                {/* 充满视图：正交/轴测向视角已由视口内的 ViewCube 承担，这里只保留「充满」动作 */}
                {!hidden("view") && !hidden("fit_view") && (
                    <ImageButton
                        icon={<IconMaximize />}
                        label={t("tb_fit")}
                        onClick={() => props.sceneMgr?.restoreView()}
                        theme={theme}
                    />
                )}
            </div>

            {/* ---------- 中：显示样式分段（真实 / 着色 / 线框） ---------- */}
            {!hidden("wireframe") && (
                <div className="ui-toolbar-center">
                    <SegmentedControl
                        className="ui-toolbar-seg"
                        options={displayModeOptions}
                        value={props.displayMode ?? "shaded"}
                        onChange={(value) => props.handleDisplayModeChange?.(value as DisplayMode)}
                    />
                </div>
            )}

            {/* ---------- 右：选择 + 工具 + 搜索 + 设置/关于 + 属性开关 ---------- */}
            <div className="ui-toolbar-right">
                {!hidden("interface") && !hidden("pick") && (
                    <>
                        <ImageButton
                            icon={<IconMousePointer />}
                            label={t("tb_pick")}
                            active={props.pickEnabled}
                            onClick={() => props.setPickEnabled?.(!props.pickEnabled)}
                            theme={theme}
                        />

                        <div className="ui-toolbar-divider-vertical" aria-hidden="true" />
                    </>
                )}

                {!hidden("tool") && props.toolsDock !== "bottom" && (
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconWrench />}
                            label={t("tb_tools")}
                            active={openMenu === "tools" || props.activeTool !== "none" && props.activeTool !== "search" && props.activeTool !== "settings"}
                            onClick={() => toggleMenu("tools")}
                            theme={theme}
                        />

                        {renderDropdown("tools", (
                            <>
                                {!hidden("measure") && toolMenuItem(<IconRuler />, t("tb_measure"), "measure")}
                                {!hidden("boxSelect") && toolMenuItem(<IconSelectAll />, t("tb_boxSelect"), "boxSelect")}
                                {!hidden("clip") && toolMenuItem(<IconScissors />, t("tb_clip"), "clip")}
                                {!hidden("viewpoint") && toolMenuItem(<IconCamera />, t("viewpoint_default_name"), "viewpoint")}
                                {!hidden("screenshot") && toolMenuItem(<IconImage />, t("tb_screenshot"), "screenshot")}
                                {!hidden("clash") && toolMenuItem(<IconTarget />, t("tb_clash"), "clash")}
                                {!hidden("explode") && toolMenuItem(<IconExplode />, t("tb_explode"), "explode")}
                            </>
                        ))}
                    </div>
                )}

                {!hidden("search") && (
                    <ImageButton
                        icon={<IconSearch />}
                        label={t("tb_search")}
                        active={props.activeTool === "search"}
                        onClick={() => setToggleTool("search")}
                        theme={theme}
                    />
                )}

                {!hidden("settings") && (
                    <ImageButton
                        icon={<IconSettings />}
                        label={t("tb_settings")}
                        active={props.activeTool === "settings"}
                        onClick={() => setToggleTool("settings")}
                        theme={theme}
                    />
                )}

                {!hidden("about") && (
                    <ImageButton
                        icon={<IconInfo />}
                        label={t("tb_about")}
                        onClick={() => props.onOpenAbout?.()}
                        theme={theme}
                    />
                )}

                {!hidden("interface") && !hidden("props") && (
                    <ImageButton
                        icon={<IconList />}
                        className="ui-toolbar-btn-icononly"
                        active={props.showProps}
                        onClick={() => props.setShowProps?.(!props.showProps)}
                        title={t("tb_props")}
                        aria-label={t("tb_props")}
                        theme={theme}
                    />
                )}
            </div>
        </div>
    );
};
