import React, { useRef } from "react";
import { ClassicMenuBarProps } from "./types";
import { isMenuHidden } from "./utils";
import { ClassicMenuItem, ClassicSubItem } from "./MenuItem";
import {
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

export const MenuBar: React.FC<ClassicMenuBarProps> = (props) => {
    const {
        t,
        hiddenMenus = [],
        handleOpenFiles,
        handleBatchConvert
    } = props;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const batchConvertInputRef = useRef<HTMLInputElement>(null);
    const hidden = (id: string) => isMenuHidden(hiddenMenus, id);

    return (
        <div className="ui-toolbar ui-menubar">
            <input
                type="file"
                ref={fileInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={handleOpenFiles}
            />

            <input
                type="file"
                ref={batchConvertInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={handleBatchConvert}
            />

            {!hidden("file") && (
                <ClassicMenuItem label={t("menu_file") || "文件"}>
                    {(close) => (
                        <>
                            {!hidden("open_file") && (
                                <ClassicSubItem
                                    icon={<IconOpenFile />}
                                    label={t("menu_open_file") || "打开文件"}
                                    onClick={() => {
                                        fileInputRef.current?.click();
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("open_url") && (
                                <ClassicSubItem
                                    label={t("menu_open_url") || "打开地址"}
                                    onClick={() => {
                                        props.handleOpenUrl?.();
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("batch_convert") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem
                                        label={t("menu_batch_convert") || "批量转换"}
                                        onClick={() => {
                                            batchConvertInputRef.current?.click();
                                            close();
                                        }}
                                    />
                                </>
                            )}

                            {!hidden("export") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem
                                        icon={<IconExportScene />}
                                        label={t("menu_export") || "导出"}
                                        onClick={() => {
                                            props.setActiveTool?.("export");
                                            close();
                                        }}
                                    />
                                </>
                            )}

                            {!hidden("clear") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem
                                        icon={<IconClear />}
                                        label={t("op_clear") || "清空"}
                                        onClick={() => {
                                            props.handleClear?.();
                                            close();
                                        }}
                                    />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("view") && (
                <ClassicMenuItem label={t("view") || "视图"}>
                    {(close) => (
                        <>
                            {!hidden("fit_view") && (
                                <ClassicSubItem
                                    label={t("menu_fit_view") || "充满视图"}
                                    onClick={() => {
                                        props.sceneMgr?.fitView();
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("views") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem icon={<IconViewFront />} label={t("view_front") || "前视图"} onClick={() => { props.handleView?.("front"); close(); }} />
                                    <ClassicSubItem icon={<IconViewBack />} label={t("view_back") || "后视图"} onClick={() => { props.handleView?.("back"); close(); }} />
                                    <ClassicSubItem icon={<IconViewTop />} label={t("view_top") || "顶视图"} onClick={() => { props.handleView?.("top"); close(); }} />
                                    <ClassicSubItem icon={<IconViewBottom />} label={t("view_bottom") || "底视图"} onClick={() => { props.handleView?.("bottom"); close(); }} />
                                    <ClassicSubItem icon={<IconViewLeft />} label={t("view_left") || "左视图"} onClick={() => { props.handleView?.("left"); close(); }} />
                                    <ClassicSubItem icon={<IconViewRight />} label={t("view_right") || "右视图"} onClick={() => { props.handleView?.("right"); close(); }} />
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem icon={<IconViewSE />} label={t("view_se") || "东南"} onClick={() => { props.handleView?.("se"); close(); }} />
                                    <ClassicSubItem icon={<IconViewSW />} label={t("view_sw") || "西南"} onClick={() => { props.handleView?.("sw"); close(); }} />
                                    <ClassicSubItem icon={<IconViewNE />} label={t("view_ne") || "东北"} onClick={() => { props.handleView?.("ne"); close(); }} />
                                    <ClassicSubItem icon={<IconViewNW />} label={t("view_nw") || "西北"} onClick={() => { props.handleView?.("nw"); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("interface") && (
                <ClassicMenuItem label={t("interface_display") || "界面显示"}>
                    {(close) => (
                        <>
                            {!hidden("outline") && (
                                <ClassicSubItem
                                    label={t("interface_outline") || "模型结构"}
                                    checked={props.showOutline}
                                    onClick={() => {
                                        props.setShowOutline?.(!props.showOutline);
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("props") && (
                                <ClassicSubItem
                                    label={t("interface_props") || "对象属性"}
                                    checked={props.showProps}
                                    onClick={() => {
                                        props.setShowProps?.(!props.showProps);
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("stats") && (
                                <ClassicSubItem
                                    label={t("st_monitor") || "状态监控"}
                                    checked={props.showStats}
                                    onClick={() => {
                                        props.setShowStats?.(!props.showStats);
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("pick") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem
                                        label={t("op_pick") || "选择"}
                                        checked={props.pickEnabled}
                                        onClick={() => {
                                            props.setPickEnabled?.(!props.pickEnabled);
                                            close();
                                        }}
                                    />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("tool") && (
                <ClassicMenuItem label={t("tool") || "工具"}>
                    {(close) => (
                        <>
                            {!hidden("measure") && <ClassicSubItem label={t("tool_measure") || "测量"} onClick={() => { props.setActiveTool?.("measure"); close(); }} />}
                            {!hidden("clip") && <ClassicSubItem label={t("tool_clip") || "剖切"} onClick={() => { props.setActiveTool?.("clip"); close(); }} />}
                            {!hidden("viewpoint") && <ClassicSubItem label={t("viewpoint_title") || "视点"} onClick={() => { props.setActiveTool?.("viewpoint"); close(); }} />}

                            {!hidden("sun") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t("st_sun_simulation") || "日照模拟"} onClick={() => { props.setActiveTool?.("sun"); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("settings_panel") && (
                <ClassicMenuItem label={t("settings") || "设置"}>
                    {(close) => (
                        <>
                            {!hidden("settings") && <ClassicSubItem label={t("settings") || "设置"} onClick={() => { props.setActiveTool?.("settings"); close(); }} />}

                            {!hidden("about") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t("menu_about") || "关于"} onClick={() => { props.onOpenAbout?.(); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}
        </div>
    );
};
