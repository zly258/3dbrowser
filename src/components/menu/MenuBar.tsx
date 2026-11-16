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
                accept=".glb,.gltf,.ifc,.nbim,.nbip,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={handleOpenFiles}
            />

            <input
                type="file"
                ref={batchConvertInputRef}
                className="ui-visually-hidden"
                multiple
                accept=".glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={handleBatchConvert}
            />

            {!hidden("file") && (
                <ClassicMenuItem label={t("menu_file")}>
                    {(close) => (
                        <>
                            {!hidden("open_file") && (
                                <ClassicSubItem
                                    icon={<IconOpenFile />}
                                    label={t("menu_open_file")}
                                    onClick={() => {
                                        fileInputRef.current?.click();
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("open_url") && (
                                <ClassicSubItem
                                    label={t("menu_open_url")}
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
                                        label={t("menu_batch_convert")}
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
                                        label={t("menu_export")}
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
                                        label={t("op_clear")}
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
                <ClassicMenuItem label={t("view")}>
                    {(close) => (
                        <>
                            {!hidden("fit_view") && (
                                <ClassicSubItem
                                    label={t("menu_fit_view")}
                                    onClick={() => {
                                        props.sceneMgr?.restoreView();
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("views") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem icon={<IconViewFront />} label={t("view_front")} onClick={() => { props.handleView?.("front"); close(); }} />
                                    <ClassicSubItem icon={<IconViewBack />} label={t("view_back")} onClick={() => { props.handleView?.("back"); close(); }} />
                                    <ClassicSubItem icon={<IconViewTop />} label={t("view_top")} onClick={() => { props.handleView?.("top"); close(); }} />
                                    <ClassicSubItem icon={<IconViewBottom />} label={t("view_bottom")} onClick={() => { props.handleView?.("bottom"); close(); }} />
                                    <ClassicSubItem icon={<IconViewLeft />} label={t("view_left")} onClick={() => { props.handleView?.("left"); close(); }} />
                                    <ClassicSubItem icon={<IconViewRight />} label={t("view_right")} onClick={() => { props.handleView?.("right"); close(); }} />
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem icon={<IconViewSE />} label={t("view_se")} onClick={() => { props.handleView?.("se"); close(); }} />
                                    <ClassicSubItem icon={<IconViewSW />} label={t("view_sw")} onClick={() => { props.handleView?.("sw"); close(); }} />
                                    <ClassicSubItem icon={<IconViewNE />} label={t("view_ne")} onClick={() => { props.handleView?.("ne"); close(); }} />
                                    <ClassicSubItem icon={<IconViewNW />} label={t("view_nw")} onClick={() => { props.handleView?.("nw"); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("interface") && (
                <ClassicMenuItem label={t("interface_display")}>
                    {(close) => (
                        <>
                            {!hidden("outline") && (
                                <ClassicSubItem
                                    label={t("interface_outline")}
                                    checked={props.showOutline}
                                    onClick={() => {
                                        props.setShowOutline?.(!props.showOutline);
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("props") && (
                                <ClassicSubItem
                                    label={t("interface_props")}
                                    checked={props.showProps}
                                    onClick={() => {
                                        props.setShowProps?.(!props.showProps);
                                        close();
                                    }}
                                />
                            )}

                            {!hidden("stats") && (
                                <ClassicSubItem
                                    label={t("st_monitor")}
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
                                        label={t("op_pick")}
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
                <ClassicMenuItem label={t("tool")}>
                    {(close) => (
                        <>
                            {!hidden("measure") && <ClassicSubItem label={t("tool_measure")} onClick={() => { props.setActiveTool?.("measure"); close(); }} />}
                            {!hidden("clip") && <ClassicSubItem label={t("tool_clip")} onClick={() => { props.setActiveTool?.("clip"); close(); }} />}
                            {!hidden("viewpoint") && <ClassicSubItem label={t("viewpoint_title")} onClick={() => { props.setActiveTool?.("viewpoint"); close(); }} />}

                            {!hidden("sun") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t("st_sun_simulation")} onClick={() => { props.setActiveTool?.("sun"); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!hidden("settings_panel") && (
                <ClassicMenuItem label={t("settings")}>
                    {(close) => (
                        <>
                            {!hidden("settings") && <ClassicSubItem label={t("settings")} onClick={() => { props.setActiveTool?.("settings"); close(); }} />}

                            {!hidden("about") && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t("menu_about")} onClick={() => { props.onOpenAbout?.(); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}
        </div>
    );
};
