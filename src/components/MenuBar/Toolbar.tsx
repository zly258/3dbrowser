import React, { useState, useEffect, useRef } from "react";
import { ThemeColors } from "../../theme/Styles";
import { ImageButton } from "../CommonUI";
import {
    IconFolderOpen, IconFile, IconDownload, IconMaximize,
    IconRuler, IconScissors, IconSettings, IconInfo,
    IconTrash2, IconMousePointer, IconBox, IconList,
    IconActivity, IconCamera, IconEye, IconSun
} from "../../theme/Icons";

interface MenuBarProps {
    t: (key: string) => string;
    styles: any;
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
    hasModels?: boolean;
}

export const Toolbar: React.FC<MenuBarProps> = (props) => {
    const {
        t, styles, theme,
        hiddenMenus = []
    } = props;

    const isHidden = (id: string) => (hiddenMenus || []).includes(id);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);
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
            <div
                ref={menuRef}
                style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    backgroundColor: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 2000,
                    minWidth: '140px',
                    padding: '4px 0',
                }}
            >
                {items}
            </div>
        );
    };

    return (
        <div style={styles.toolbarBar}>
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
                <div style={styles.toolbarGroup}>
                    <div style={{ position: 'relative' }}>
                        <ImageButton
                            icon={<IconFile width={20} height={20} />}
                            label={t('tb_file')}
                            active={openMenu === 'file'}
                            onClick={() => toggleMenu('file')}
                            styles={styles}
                            theme={theme}
                        />
                        {renderDropdown('file', (
                            <>
                                {!isHidden('open_file') && (
                                    <div
                                        style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                        onClick={() => { fileInputRef.current?.click(); setOpenMenu(null); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {t('menu_open_file')}
                                    </div>
                                )}
                                {!isHidden('open_folder') && (
                                    <div
                                        style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                        onClick={() => { folderInputRef.current?.click(); setOpenMenu(null); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {t('menu_open_folder')}
                                    </div>
                                )}
                                {!isHidden('export') && (
                                    <div
                                        style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                        onClick={() => { props.setActiveTool?.('export'); setOpenMenu(null); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {t('menu_export')}
                                    </div>
                                )}
                                {!isHidden('clear') && (
                                    <div
                                        style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                        onClick={() => { props.handleClear?.(); setOpenMenu(null); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {t('op_clear')}
                                    </div>
                                )}
                            </>
                        ))}
                    </div>
                </div>
            )}

                    {!isHidden('view') && (
                <div style={styles.toolbarGroup}>
                    <ImageButton
                        icon={<IconMaximize width={20} height={20} />}
                        label={t('tb_fit')}
                        onClick={() => props.sceneMgr?.fitView()}
                        styles={styles}
                        theme={theme}
                    />
                    <div style={{ position: 'relative' }}>
                        <ImageButton
                            icon={<IconEye width={20} height={20} />}
                            label={t('tb_view')}
                            active={openMenu === 'views'}
                            onClick={() => toggleMenu('views')}
                            disabled={!props.hasModels}
                            styles={styles}
                            theme={theme}
                        />
                        {renderDropdown('views', (
                            <>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('front'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_front')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('back'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_back')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('top'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_top')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('bottom'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_bottom')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('left'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_left')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('right'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_right')}
                                </div>
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('se'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_se')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('sw'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_sw')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('ne'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_ne')}
                                </div>
                                <div
                                    style={{ padding: '6px 16px', fontSize: '12px', color: theme.text, cursor: 'pointer', backgroundColor: 'transparent' }}
                                    onClick={() => { props.handleView?.('nw'); setOpenMenu(null); }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {t('view_nw')}
                                </div>
                            </>
                        ))}
                    </div>
                </div>
            )}

            {!isHidden('interface') && (
                <div style={styles.toolbarGroup}>
                    {!isHidden('outline') && (
                        <ImageButton
                            icon={<IconBox width={20} height={20} />}
                            label={t('tb_model')}
                            active={props.showOutline}
                            onClick={() => props.setShowOutline?.(!props.showOutline)}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('props') && (
                        <ImageButton
                            icon={<IconList width={20} height={20} />}
                            label={t('tb_props')}
                            active={props.showProps}
                            onClick={() => props.setShowProps?.(!props.showProps)}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('pick') && (
                        <ImageButton
                            icon={<IconMousePointer width={20} height={20} />}
                            label={t('tb_pick')}
                            active={props.pickEnabled}
                            onClick={() => props.setPickEnabled?.(!props.pickEnabled)}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!isHidden('tool') && (
                <div style={styles.toolbarGroup}>
                    {!isHidden('measure') && (
                        <ImageButton
                            icon={<IconRuler width={24} height={24} strokeWidth={2} />}
                            label={t('tb_measure')}
                            active={props.activeTool === 'measure'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'measure' ? 'none' : 'measure')}
                            disabled={!props.hasModels}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('clip') && (
                        <ImageButton
                            icon={<IconScissors width={20} height={20} />}
                            label={t('tb_clip')}
                            active={props.activeTool === 'clip'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'clip' ? 'none' : 'clip')}
                            disabled={!props.hasModels}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('viewpoint') && (
                        <ImageButton
                            icon={<IconCamera width={20} height={20} />}
                            label={t('tb_view')}
                            active={props.activeTool === 'viewpoint'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'viewpoint' ? 'none' : 'viewpoint')}
                            disabled={!props.hasModels}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('sun') && (
                        <ImageButton
                            icon={<IconSun width={20} height={20} />}
                            label={t('tb_sun')}
                            active={props.activeTool === 'sun'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'sun' ? 'none' : 'sun')}
                            disabled={!props.hasModels}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!isHidden('about') && (
                <div style={styles.toolbarGroupLast}>
                    {!isHidden('settings') && (
                        <ImageButton
                            icon={<IconSettings width={20} height={20} />}
                            label={t('tb_settings')}
                            active={props.activeTool === 'settings'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'settings' ? 'none' : 'settings')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    <ImageButton
                        icon={<IconInfo width={20} height={20} />}
                        label={t('tb_about')}
                        onClick={() => props.onOpenAbout?.()}
                        styles={styles}
                        theme={theme}
                    />
                </div>
            )}
        </div>
    );
};
