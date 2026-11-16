import React, { useEffect, useRef, useState } from "react";
import { ImageButton } from "../common/ImageButton";
import { SegmentedControl } from "../common";
import { ToolbarProps } from "./types";
import type { DisplayMode } from "../../utils/scene-manager/displayMode";
import { cx, isMenuHidden } from "./utils";
import {
    IconFile,
    IconMaximize,
    IconEye,
    IconRuler,
    IconTarget,
    IconScissors,
    IconSettings,
    IconInfo,
    IconMousePointer,
    IconBox,
    IconList,
    IconCamera,
    IconSearch,
    IconSelectAll,
    IconWrench,
    IconImage,
    IconExplode,
    IconViewTop,
    IconViewBottom,
    IconViewFront,
    IconViewBack,
    IconViewLeft,
    IconViewRight,
    IconViewSW,
    IconViewSE,
    IconViewNE,
    IconViewNW,
    IconOpenFile,
    IconExportScene,
    IconClear
} from "../../theme/Icons";

/**
 * 顶栏（MD3 语言）：左「品牌 + 文件/视图」｜中「显示样式分段」｜右「显示开关 + 工具 + 搜索/设置/关于」。
 * 长尾工具（测量/框选/剖切/视点/截图/碰撞/爆炸）收进「工具」下拉，
 * 激活态在菜单内用对勾标记，同时底栏模式托盘展示可清除的模式胶囊。
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

    /* 显示样式分段（真实/着色/线框），对齐参考中部分段切换 */
    const displayModeOptions = [
        { value: "realistic", label: t("dm_realistic") || "真实" },
        { value: "shaded", label: t("dm_solid") || "着色" },
        { value: "wireframe", label: t("dm_wireframe") || "线框" }
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

            {/* ---------- 左：品牌 + 文件 + 视图 ---------- */}
            <div className="ui-toolbar-left">
                <span className="ui-toolbar-brand">3D Browser</span>
                <div className="ui-toolbar-divider-vertical" aria-hidden="true" />

                {!hidden("file") && (
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconFile />}
                            label={t("tb_file") || "文件"}
                            active={openMenu === "file"}
                            onClick={() => toggleMenu("file")}
                            theme={theme}
                        />

                        {renderDropdown("file", (
                            <>
                                {!hidden("open_file") && menuItem(<IconOpenFile />, t("menu_open_file") || "打开文件", () => {
                                    fileInputRef.current?.click();
                                    closeMenu();
                                })}

                                {!hidden("open_url") && menuItem(<IconOpenFile />, t("menu_open_url") || "打开地址", () => {
                                    props.handleOpenUrl?.();
                                    closeMenu();
                                })}

                                {!hidden("batch_convert") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconExportScene />, t("menu_batch_convert") || "批量转换", () => {
                                            batchConvertInputRef.current?.click();
                                            closeMenu();
                                        })}
                                    </>
                                )}

                                {!hidden("export") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconExportScene />, t("menu_export") || "导出", () => {
                                            props.setActiveTool?.("export");
                                            closeMenu();
                                        })}
                                    </>
                                )}

                                {!hidden("clear") && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconClear />, t("op_clear") || "清空", () => {
                                            props.handleClear?.();
                                            closeMenu();
                                        })}
                                    </>
                                )}
                            </>
                        ))}
                    </div>
                )}

                {!hidden("view") && (
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconEye />}
                            label={t("tb_view") || "视图"}
                            active={openMenu === "views"}
                            onClick={() => toggleMenu("views")}
                            theme={theme}
                        />

                        {renderDropdown("views", (
                            <>
                                {!hidden("fit_view") && menuItem(<IconMaximize />, t("tb_fit") || "充满视图", () => {
                                    props.sceneMgr?.restoreView();
                                    closeMenu();
                                })}

                                {!hidden("fit_view") && menuDivider()}

                                {menuItem(<IconViewFront />, t("view_front") || "前视图", () => { props.handleView?.("front"); closeMenu(); })}
                                {menuItem(<IconViewBack />, t("view_back") || "后视图", () => { props.handleView?.("back"); closeMenu(); })}
                                {menuItem(<IconViewTop />, t("view_top") || "顶视图", () => { props.handleView?.("top"); closeMenu(); })}
                                {menuItem(<IconViewBottom />, t("view_bottom") || "底视图", () => { props.handleView?.("bottom"); closeMenu(); })}
                                {menuItem(<IconViewLeft />, t("view_left") || "左视图", () => { props.handleView?.("left"); closeMenu(); })}
                                {menuItem(<IconViewRight />, t("view_right") || "右视图", () => { props.handleView?.("right"); closeMenu(); })}
                                {menuDivider()}
                                {menuItem(<IconViewSE />, t("view_se") || "东南", () => { props.handleView?.("se"); closeMenu(); })}
                                {menuItem(<IconViewSW />, t("view_sw") || "西南", () => { props.handleView?.("sw"); closeMenu(); })}
                                {menuItem(<IconViewNE />, t("view_ne") || "东北", () => { props.handleView?.("ne"); closeMenu(); })}
                                {menuItem(<IconViewNW />, t("view_nw") || "西北", () => { props.handleView?.("nw"); closeMenu(); })}
                            </>
                        ))}
                    </div>
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

            {/* ---------- 右：显示开关 + 工具 + 搜索 + 设置/关于 ---------- */}
            <div className="ui-toolbar-right">
                {!hidden("interface") && (
                    <>
                        {!hidden("outline") && (
                            <ImageButton
                                icon={<IconBox />}
                                label={t("tb_model") || "模型"}
                                active={props.showOutline}
                                onClick={() => props.setShowOutline?.(!props.showOutline)}
                                theme={theme}
                            />
                        )}

                        {!hidden("props") && (
                            <ImageButton
                                icon={<IconList />}
                                label={t("tb_props") || "属性"}
                                active={props.showProps}
                                onClick={() => props.setShowProps?.(!props.showProps)}
                                theme={theme}
                            />
                        )}

                        {!hidden("pick") && (
                            <ImageButton
                                icon={<IconMousePointer />}
                                label={t("tb_pick") || "选择"}
                                active={props.pickEnabled}
                                onClick={() => props.setPickEnabled?.(!props.pickEnabled)}
                                theme={theme}
                            />
                        )}

                        <div className="ui-toolbar-divider-vertical" aria-hidden="true" />
                    </>
                )}

                {!hidden("tool") && (
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconWrench />}
                            label={t("tb_tools") || "工具"}
                            active={openMenu === "tools" || props.activeTool !== "none" && props.activeTool !== "search" && props.activeTool !== "settings"}
                            onClick={() => toggleMenu("tools")}
                            theme={theme}
                        />

                        {renderDropdown("tools", (
                            <>
                                {!hidden("measure") && toolMenuItem(<IconRuler />, t("tb_measure") || "测量", "measure")}
                                {!hidden("boxSelect") && toolMenuItem(<IconSelectAll />, t("tb_boxSelect") || "框选", "boxSelect")}
                                {!hidden("clip") && toolMenuItem(<IconScissors />, t("tb_clip") || "剖切", "clip")}
                                {!hidden("viewpoint") && toolMenuItem(<IconCamera />, t("viewpoint_default_name") || "视点", "viewpoint")}
                                {!hidden("screenshot") && toolMenuItem(<IconImage />, t("tb_screenshot") || "截图", "screenshot")}
                                {!hidden("clash") && toolMenuItem(<IconTarget />, t("tb_clash") || "碰撞", "clash")}
                                {!hidden("explode") && toolMenuItem(<IconExplode />, t("tb_explode") || "爆炸", "explode")}
                            </>
                        ))}
                    </div>
                )}

                {!hidden("search") && (
                    <ImageButton
                        icon={<IconSearch />}
                        label={t("tb_search") || "搜索"}
                        active={props.activeTool === "search"}
                        onClick={() => setToggleTool("search")}
                        theme={theme}
                    />
                )}

                {!hidden("settings") && (
                    <ImageButton
                        icon={<IconSettings />}
                        label={t("tb_settings") || "设置"}
                        active={props.activeTool === "settings"}
                        onClick={() => setToggleTool("settings")}
                        theme={theme}
                    />
                )}

                {!hidden("about") && (
                    <ImageButton
                        icon={<IconInfo />}
                        label={t("tb_about") || "关于"}
                        onClick={() => props.onOpenAbout?.()}
                        theme={theme}
                    />
                )}
            </div>
        </div>
    );
};
