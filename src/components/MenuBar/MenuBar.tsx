import React, { useRef } from "react";
import { ThemeColors } from "../../theme/Styles";
import { ClassicMenuItem, ClassicSubItem } from "./MenuItem";

interface MenuBarProps {
    t: (key: string) => string;
        theme: ThemeColors;
    themeType?: 'dark' | 'light';
    setThemeType?: (type: 'dark' | 'light') => void;
    handleOpenFiles?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleBatchConvert?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleOpenFolder?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleOpenUrl?: () => void;
    handleView?: (view: string) => void;
    handleClear?: () => void;
    pickEnabled?: boolean;
    setPickEnabled?: (enabled: boolean) => void;
    activeTool?: 'none' | 'measure' | 'clip' | 'settings' | 'export' | 'viewpoint' | 'sun';
    setActiveTool?: (tool: 'none' | 'measure' | 'clip' | 'settings' | 'export' | 'viewpoint' | 'sun') => void;
    showOutline?: boolean;
    setShowOutline?: (show: boolean) => void;
    showProps?: boolean;
    setShowProps?: (show: boolean) => void;
    showStats?: boolean;
    setShowStats?: (show: boolean) => void;
    sceneMgr?: any;
    hiddenMenus?: string[];
    onOpenAbout?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
    const {
        t, theme,
        hiddenMenus = []
    } = props;

    const isHidden = (id: string) => (hiddenMenus || []).includes(id);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);
    const batchConvertInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div className="ui-toolbar" style={{ height: '26px', padding: '0 8px' }}>
            {/* Hidden inputs for file/folder opening */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleOpenFiles}
            />
            <input
                type="file"
                ref={batchConvertInputRef}
                style={{ display: 'none' }}
                multiple
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleBatchConvert}
            />
            <input
                type="file"
                ref={folderInputRef}
                style={{ display: 'none' }}
                {...{ webkitdirectory: "", directory: "" } as any}
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleOpenFolder}
            />

            {!isHidden('file') && (
                <ClassicMenuItem label={t('menu_file')} >
                    {(close) => (
                        <>
                            {!isHidden('open_file') && <ClassicSubItem label={t('menu_open_file')} onClick={() => { fileInputRef.current?.click(); close(); }} />}
                            {!isHidden('open_folder') && <ClassicSubItem label={t('menu_open_folder')} onClick={() => { folderInputRef.current?.click(); close(); }} />}
                            {!isHidden('open_url') && <ClassicSubItem label={t('menu_open_url')} onClick={() => { props.handleOpenUrl?.(); close(); }} />}
                            {!isHidden('batch_convert') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('menu_batch_convert')} onClick={() => { batchConvertInputRef.current?.click(); close(); }} />
                                </>
                            )}
                            {!isHidden('export') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('menu_export')} onClick={() => { props.setActiveTool?.('export'); close(); }} />
                                </>
                            )}
                            {!isHidden('clear') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('op_clear')} onClick={() => { props.handleClear?.(); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('view') && (
                <ClassicMenuItem label={t('view')} >
                    {(close) => (
                        <>
                            {!isHidden('fit_view') && <ClassicSubItem label={t('menu_fit_view')} onClick={() => { props.sceneMgr?.fitView(); close(); }} />}
                            {!isHidden('views') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('view_front')} onClick={() => { props.handleView?.('front'); close(); }} />
                                    <ClassicSubItem label={t('view_back')} onClick={() => { props.handleView?.('back'); close(); }} />
                                    <ClassicSubItem label={t('view_top')} onClick={() => { props.handleView?.('top'); close(); }} />
                                    <ClassicSubItem label={t('view_bottom')} onClick={() => { props.handleView?.('bottom'); close(); }} />
                                    <ClassicSubItem label={t('view_left')} onClick={() => { props.handleView?.('left'); close(); }} />
                                    <ClassicSubItem label={t('view_right')} onClick={() => { props.handleView?.('right'); close(); }} />
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('view_se')} onClick={() => { props.handleView?.('se'); close(); }} />
                                    <ClassicSubItem label={t('view_sw')} onClick={() => { props.handleView?.('sw'); close(); }} />
                                    <ClassicSubItem label={t('view_ne')} onClick={() => { props.handleView?.('ne'); close(); }} />
                                    <ClassicSubItem label={t('view_nw')} onClick={() => { props.handleView?.('nw'); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('interface') && (
                <ClassicMenuItem label={t('interface_display')} >
                    {(close) => (
                        <>
                            {!isHidden('outline') && <ClassicSubItem label={t('interface_outline')} checked={props.showOutline} onClick={() => { props.setShowOutline?.(!props.showOutline); close(); }} />}
                            {!isHidden('props') && <ClassicSubItem label={t('interface_props')} checked={props.showProps} onClick={() => { props.setShowProps?.(!props.showProps); close(); }} />}
                            {!isHidden('stats') && <ClassicSubItem label={t('st_monitor')} checked={props.showStats} onClick={() => { props.setShowStats?.(!props.showStats); close(); }} />}
                            {!isHidden('pick') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('op_pick')} checked={props.pickEnabled} onClick={() => { props.setPickEnabled?.(!props.pickEnabled); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('tool') && (
                <ClassicMenuItem label={t('tool')} >
                    {(close) => (
                        <>
                            {!isHidden('measure') && <ClassicSubItem label={t('tool_measure')} onClick={() => { props.setActiveTool?.('measure'); close(); }} />}
                            {!isHidden('clip') && <ClassicSubItem label={t('tool_clip')} onClick={() => { props.setActiveTool?.('clip'); close(); }} />}
                            {!isHidden('viewpoint') && <ClassicSubItem label={t('viewpoint_title')} onClick={() => { props.setActiveTool?.('viewpoint'); close(); }} />}
                            {!isHidden('sun') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('st_sun_simulation')} onClick={() => { props.setActiveTool?.('sun'); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('settings_panel') && (
                <ClassicMenuItem label={t('settings')} >
                    {(close) => (
                        <>
                            {!isHidden('settings') && <ClassicSubItem label={t('settings')} onClick={() => { props.setActiveTool?.('settings'); close(); }} />}
                            {!isHidden('about') && (
                                <>
                                    <div className="ui-context-menu-divider" />
                                    <ClassicSubItem label={t('menu_about')} onClick={() => { props.onOpenAbout?.(); close(); }} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}
        </div>
    );
};
