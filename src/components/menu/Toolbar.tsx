import React, { useEffect, useRef, useState } from "react";
import { ImageButton } from "../common/ImageButton";
import { ToolbarProps } from "./types";
import { isMenuHidden } from "./utils";
import {
    IconFile,
    IconMaximize,
    IconRuler,
    IconScissors,
    IconSettings,
    IconInfo,
    IconMousePointer,
    IconBox,
    IconList,
    IconCamera,
    IconEye,
    IconSearch,
    IconSelectAll,
    IconTarget,
    IconLayers,
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
    IconSolid,
    IconTransparent,
    IconOpenFile,
    IconExportScene,
    IconClear
} from "../../theme/Icons";

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

    const menuItem = (icon: React.ReactNode, label: string, onClick: () => void) => (
        <div
            className="ui-toolbar-menu-item"
            role="menuitem"
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
            <span>{label}</span>
        </div>
    );

    const menuDivider = () => <div className="ui-toolbar-menu-divider" />;

    const setToggleTool = (tool: NonNullable<ToolbarProps["activeTool"]>) => {
        props.setActiveTool?.(props.activeTool === tool ? "none" : tool);
    };

    return (
        <div ref={toolbarRef} className="ui-toolbar">
            <input
                type="file"
                ref={fileInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleOpenFiles}
            />

            <input
                type="file"
                ref={batchConvertInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleBatchConvert}
            />

            {!hidden("file") && (
                <div className="ui-toolbar-group">
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
                </div>
            )}

            {!hidden("view") && (
                <div className="ui-toolbar-group">
                    {!hidden("fit_view") && (
                        <ImageButton
                            icon={<IconMaximize />}
                            label={t("tb_fit") || "充满"}
                            onClick={() => props.sceneMgr?.fitView()}
                            theme={theme}
                        />
                    )}

                    {!hidden("views") && (
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
            )}

            {!hidden("interface") && (
                <div className="ui-toolbar-group">
                    {!hidden("wireframe") && (
                        <div className="ui-toolbar-menu-anchor">
                            <ImageButton
                                icon={<IconLayers />}
                                label={t("display_mode") || "样式"}
                                active={openMenu === "displayMode"}
                                onClick={() => toggleMenu("displayMode")}
                                theme={theme}
                            />

                            {renderDropdown("displayMode", (
                                <>
                                    {menuItem(<IconSolid />, t("dm_solid") || "着色", () => {
                                        props.handleDisplayModeChange?.("solid");
                                        closeMenu();
                                    })}

                                    {menuItem(<IconTransparent />, t("dm_transparent") || "透明", () => {
                                        props.handleDisplayModeChange?.("transparent");
                                        closeMenu();
                                    })}
                                </>
                            ))}
                        </div>
                    )}

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
                </div>
            )}

            {!hidden("tool") && (
                <div className="ui-toolbar-group">
                    {!hidden("measure") && (
                        <ImageButton
                            icon={<IconRuler />}
                            label={t("tb_measure") || "测量"}
                            active={props.activeTool === "measure"}
                            onClick={() => setToggleTool("measure")}
                            theme={theme}
                        />
                    )}

                    {!hidden("boxSelect") && (
                        <ImageButton
                            icon={<IconSelectAll />}
                            label={t("tb_boxSelect") || "框选"}
                            active={props.activeTool === "boxSelect"}
                            onClick={() => setToggleTool("boxSelect")}
                            theme={theme}
                        />
                    )}

                    {!hidden("clip") && (
                        <ImageButton
                            icon={<IconScissors />}
                            label={t("tb_clip") || "剖切"}
                            active={props.activeTool === "clip"}
                            onClick={() => setToggleTool("clip")}
                            theme={theme}
                        />
                    )}

                    {!hidden("viewpoint") && (
                        <ImageButton
                            icon={<IconCamera />}
                            label={t("tb_view") || "视点"}
                            active={props.activeTool === "viewpoint"}
                            onClick={() => setToggleTool("viewpoint")}
                            theme={theme}
                        />
                    )}

                    {!hidden("screenshot") && (
                        <ImageButton
                            icon={<IconImage />}
                            label={t("tb_screenshot") || "截图"}
                            active={props.activeTool === "screenshot"}
                            onClick={() => props.openScreenshotPanel?.()}
                            theme={theme}
                        />
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

                    {!hidden("clash") && (
                        <ImageButton
                            icon={<IconTarget />}
                            label={t("tb_clash") || "碰撞"}
                            active={props.activeTool === "clash"}
                            onClick={() => setToggleTool("clash")}
                            theme={theme}
                        />
                    )}

                    {!hidden("explode") && (
                        <ImageButton
                            icon={<IconExplode />}
                            label={t("tb_explode") || "爆炸"}
                            active={props.activeTool === "explode"}
                            onClick={() => setToggleTool("explode")}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!hidden("about") && (
                <div className="ui-toolbar-group">
                    {!hidden("settings") && (
                        <ImageButton
                            icon={<IconSettings />}
                            label={t("tb_settings") || "设置"}
                            active={props.activeTool === "settings"}
                            onClick={() => setToggleTool("settings")}
                            theme={theme}
                        />
                    )}

                    <ImageButton
                        icon={<IconInfo />}
                        label={t("tb_about") || "关于"}
                        onClick={() => props.onOpenAbout?.()}
                        theme={theme}
                    />
                </div>
            )}
        </div>
    );
};
