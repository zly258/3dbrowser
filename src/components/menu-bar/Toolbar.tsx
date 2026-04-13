import React, { useState, useEffect, useRef } from "react";
import { ThemeColors } from "../../theme/styles";
import { ImageButton } from "../common/ImageButton";
import {
    IconFile, IconDownload, IconMaximize,
    IconRuler, IconScissors, IconSettings, IconInfo,
    IconTrash2, IconMousePointer, IconBox, IconList,
    IconActivity, IconCamera, IconEye, IconSearch, IconSelectAll, IconTarget,
    IconLayers, IconImage, IconExplode,
    IconViewTop, IconViewBottom, IconViewFront, IconViewBack, IconViewLeft, IconViewRight,
    IconViewSW, IconViewSE, IconViewNE, IconViewNW,
    IconSolid, IconTransparent,
    IconOpenFile, IconExportScene, IconClear
} from "../../theme/Icons";

interface MenuBarProps {
    t: (key: string) => string;
        theme: ThemeColors;
    themeType?: 'dark' | 'light';
    setThemeType?: (type: 'dark' | 'light') => void;
    handleOpenFiles?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleBatchConvert?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleOpenUrl?: () => void;
    handleView?: (view: string) => void;
    handleClear?: () => void;
    openScreenshotPanel?: () => void;
    handleDisplayModeChange?: (mode: 'solid' | 'transparent') => void;
    displayMode?: 'solid' | 'transparent';
    pickEnabled?: boolean;
    setPickEnabled?: (enabled: boolean) => void;
    activeTool?: 'none' | 'measure' | 'clip' | 'settings' | 'export' | 'screenshot' | 'viewpoint' | 'search' | 'boxSelect' | 'explode' | 'clash';
    setActiveTool?: (tool: 'none' | 'measure' | 'clip' | 'settings' | 'export' | 'screenshot' | 'viewpoint' | 'search' | 'boxSelect' | 'explode' | 'clash') => void;
    showOutline?: boolean;
    setShowOutline?: (show: boolean) => void;
    showProps?: boolean;
    setShowProps?: (show: boolean) => void;
    showStats?: boolean;
    setShowStats?: (show: boolean) => void;
    sceneMgr?: any;
    hiddenMenus?: string[];
    onOpenAbout?: () => void;
    hasModels?: boolean;
}

export const Toolbar: React.FC<MenuBarProps> = (props) => {
    const {
        t, theme,
        hiddenMenus = []
    } = props;

    const isHidden = (id: string) => (hiddenMenus || []).includes(id);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const batchConvertInputRef = React.useRef<HTMLInputElement>(null);

    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleMenu = (menuId: string) => {
        setOpenMenu(openMenu === menuId ? null : menuId);
    };

    const renderDropdown = (menuId: string, items: React.ReactNode) => {
        if (openMenu !== menuId) return null;
        return (
            <div ref={menuRef} className="ui-toolbar-menu">
                {items}
            </div>
        );
    };

    const menuItem = (icon: React.ReactNode, label: string, onClick: () => void) => (
        <div
            className="ui-toolbar-menu-item"
            onClick={onClick}
        >
            <span className="ui-toolbar-menu-icon">
                {icon}
            </span>
            {label}
        </div>
    );

    const menuDivider = () => <div className="ui-toolbar-menu-divider" />;

    return (
        <div className="ui-toolbar">
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
            {!isHidden('file') && (
                <div className="ui-toolbar-group">
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                        icon={<IconFile />}
                        label={t('tb_file')}
                            active={openMenu === 'file'}
                            onClick={() => toggleMenu('file')}
                            theme={theme}
                        />
                        {renderDropdown('file', (
                            <>
                                {!isHidden('open_file') && menuItem(<IconOpenFile />, t('menu_open_file'), () => { fileInputRef.current?.click(); setOpenMenu(null); })}
                                {!isHidden('export') && menuItem(<IconExportScene />, t('menu_export'), () => { props.setActiveTool?.('export'); setOpenMenu(null); })}
                                {!isHidden('clear') && (
                                    <>
                                        {menuDivider()}
                                        {menuItem(<IconClear />, t('op_clear'), () => { props.handleClear?.(); setOpenMenu(null); })}
                                    </>
                                )}
                            </>
                        ))}
                    </div>
                </div>
            )}

                {!isHidden('view') && (
                <div className="ui-toolbar-group">
                    <ImageButton
                        icon={<IconMaximize />}
                        label={t('tb_fit')}
                        onClick={() => props.sceneMgr?.fitView()}
                        theme={theme}
                    />
                    <div className="ui-toolbar-menu-anchor">
                        <ImageButton
                            icon={<IconEye />}
                            label={t('tb_view')}
                            active={openMenu === 'views'}
                            onClick={() => toggleMenu('views')}
                            theme={theme}
                        />
                        {renderDropdown('views', (
                            <>
                                {menuItem(<IconViewFront />, t('view_front'), () => { props.handleView?.('front'); setOpenMenu(null); })}
                                {menuItem(<IconViewBack />, t('view_back'), () => { props.handleView?.('back'); setOpenMenu(null); })}
                                {menuItem(<IconViewTop />, t('view_top'), () => { props.handleView?.('top'); setOpenMenu(null); })}
                                {menuItem(<IconViewBottom />, t('view_bottom'), () => { props.handleView?.('bottom'); setOpenMenu(null); })}
                                {menuItem(<IconViewLeft />, t('view_left'), () => { props.handleView?.('left'); setOpenMenu(null); })}
                                {menuItem(<IconViewRight />, t('view_right'), () => { props.handleView?.('right'); setOpenMenu(null); })}
                                {menuDivider()}
                                {menuItem(<IconViewSE />, t('view_se'), () => { props.handleView?.('se'); setOpenMenu(null); })}
                                {menuItem(<IconViewSW />, t('view_sw'), () => { props.handleView?.('sw'); setOpenMenu(null); })}
                                {menuItem(<IconViewNE />, t('view_ne'), () => { props.handleView?.('ne'); setOpenMenu(null); })}
                                {menuItem(<IconViewNW />, t('view_nw'), () => { props.handleView?.('nw'); setOpenMenu(null); })}
                            </>
                        ))}
                    </div>
                </div>
            )}

            {!isHidden('interface') && (
                <div className="ui-toolbar-group">
                    {!isHidden('wireframe') && (
                        <div className="ui-toolbar-menu-anchor">
                            <ImageButton
                                icon={<IconLayers />}
                                label={t('display_mode') || '样式'}
                                active={openMenu === 'displayMode'}
                                onClick={() => toggleMenu('displayMode')}
                                theme={theme}
                            />
                            {renderDropdown('displayMode', (
                                <>
                                    {menuItem(<IconSolid />, t('dm_solid') || '着色', () => { props.handleDisplayModeChange?.('solid'); setOpenMenu(null); })}
                                    {menuItem(<IconTransparent />, t('dm_transparent') || '透明', () => { props.handleDisplayModeChange?.('transparent'); setOpenMenu(null); })}
                                </>
                            ))}
                        </div>
                    )}
                    {!isHidden('outline') && (
                        <ImageButton
                            icon={<IconBox />}
                            label={t('tb_model')}
                            active={props.showOutline}
                            onClick={() => props.setShowOutline?.(!props.showOutline)}
                            theme={theme}
                        />
                    )}
                    {!isHidden('props') && (
                        <ImageButton
                            icon={<IconList />}
                            label={t('tb_props')}
                            active={props.showProps}
                            onClick={() => props.setShowProps?.(!props.showProps)}
                            theme={theme}
                        />
                    )}
                    {!isHidden('pick') && (
                        <ImageButton
                            icon={<IconMousePointer />}
                            label={t('tb_pick')}
                            active={props.pickEnabled}
                            onClick={() => props.setPickEnabled?.(!props.pickEnabled)}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!isHidden('tool') && (
                <div className="ui-toolbar-group">
                    {!isHidden('measure') && (
                        <ImageButton
                            icon={<IconRuler />}
                            label={t('tb_measure')}
                            active={props.activeTool === 'measure'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'measure' ? 'none' : 'measure')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('boxSelect') && (
                        <ImageButton
                            icon={<IconSelectAll />}
                            label={t('tb_boxSelect')}
                            active={props.activeTool === 'boxSelect'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'boxSelect' ? 'none' : 'boxSelect')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('clip') && (
                        <ImageButton
                            icon={<IconScissors />}
                            label={t('tb_clip')}
                            active={props.activeTool === 'clip'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'clip' ? 'none' : 'clip')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('viewpoint') && (
                        <ImageButton
                            icon={<IconCamera />}
                            label={t('tb_view')}
                            active={props.activeTool === 'viewpoint'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'viewpoint' ? 'none' : 'viewpoint')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('screenshot') && (
                        <ImageButton
                            icon={<IconImage />}
                            label={t('tb_screenshot') || '截图'}
                            active={props.activeTool === 'screenshot'}
                            onClick={() => props.openScreenshotPanel?.()}
                            theme={theme}
                        />
                    )}
                    {!isHidden('search') && (
                        <ImageButton
                            icon={<IconSearch />}
                            label={t('tb_search') || '搜索'}
                            active={props.activeTool === 'search'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'search' ? 'none' : 'search')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('clash') && (
                        <ImageButton
                            icon={<IconTarget />}
                            label={t('tb_clash') || '碰撞'}
                            active={props.activeTool === 'clash'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'clash' ? 'none' : 'clash')}
                            theme={theme}
                        />
                    )}
                    {!isHidden('explode') && (
                        <ImageButton
                            icon={<IconExplode />}
                            label={t('tb_explode') || '爆炸'}
                            active={props.activeTool === 'explode'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'explode' ? 'none' : 'explode')}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!isHidden('about') && (
                <div className="ui-toolbar-group">
                    {!isHidden('settings') && (
                        <ImageButton
                            icon={<IconSettings />}
                            label={t('tb_settings')}
                            active={props.activeTool === 'settings'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'settings' ? 'none' : 'settings')}
                            theme={theme}
                        />
                    )}
                    <ImageButton
                        icon={<IconInfo />}
                        label={t('tb_about')}
                        onClick={() => props.onOpenAbout?.()}
                        theme={theme}
                    />
                </div>
            )}
        </div>
    );
};
