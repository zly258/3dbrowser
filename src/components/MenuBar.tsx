import React, { useState, useRef, useEffect } from "react";
import { ThemeColors } from "../theme/Styles";
import { ImageButton } from "./CommonUI";
import { 
    IconFolderOpen, IconFile, IconDownload, IconMaximize, 
    IconRuler, IconScissors, IconSettings, IconInfo, 
    IconTrash2, IconMousePointer, IconBox, IconList, 
    IconActivity, IconCamera, IconEye, IconSun 
} from "../theme/Icons";

interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    styles: any;
    enabled?: boolean;
}

const ClassicMenuItem = ({ label, children, styles, enabled = true }: MenuItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => {
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleMenu = () => {
        if (enabled) {
            setIsOpen(!isOpen);
        }
    };

    const itemStyle = {
        ...styles.classicMenuItem(isOpen, false),
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
        pointerEvents: enabled ? 'auto' : 'none' as any,
    };

    return (
        <div 
            ref={menuRef}
            style={{ position: 'relative', height: '100%' }}
        >
            <div 
                style={itemStyle} 
                onClick={toggleMenu}
            >
                {label}
            </div>
            {isOpen && enabled && (
                <div style={styles.classicMenuDropdown}>
                    {children(closeMenu)}
                </div>
            )}
        </div>
    );
};

interface SubItemProps {
    label: string;
    onClick: () => void;
    styles: any;
    enabled?: boolean;
    checked?: boolean;
}

const ClassicSubItem = ({ label, onClick, styles, enabled = true, checked }: SubItemProps) => {
    const [hover, setHover] = useState(false);
    
    const itemStyle = {
        ...styles.classicMenuSubItem(hover),
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
        pointerEvents: enabled ? 'auto' : 'none' as any,
        outline: 'none',
    };

    return (
        <div 
            style={itemStyle}
            onClick={() => { 
                if (enabled) {
                    setHover(false);
                    onClick(); 
                }
            }}
            onMouseEnter={() => enabled && setHover(true)}
            onMouseLeave={() => setHover(false)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {checked !== undefined && (
                    <div style={styles.checkboxCustom(checked)}>
                        {checked && <div style={styles.checkboxCheckmark}>✓</div>}
                    </div>
                )}
                {label}
            </div>
        </div>
    );
};

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
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
    const {
        t, styles, theme,
        hiddenMenus = []
    } = props;

    const isHidden = (id: string) => (hiddenMenus || []).includes(id);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);
    const batchConvertInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div style={styles.classicMenuBar}>
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
                <ClassicMenuItem label={t('menu_file')} styles={styles}>
                    {(close) => (
                        <>
                            {!isHidden('open_file') && <ClassicSubItem label={t('menu_open_file')} onClick={() => { fileInputRef.current?.click(); close(); }} styles={styles} />}
                            {!isHidden('open_folder') && <ClassicSubItem label={t('menu_open_folder')} onClick={() => { folderInputRef.current?.click(); close(); }} styles={styles} />}
                            {!isHidden('open_url') && <ClassicSubItem label={t('menu_open_url')} onClick={() => { props.handleOpenUrl?.(); close(); }} styles={styles} />}
                            {!isHidden('batch_convert') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('menu_batch_convert')} onClick={() => { batchConvertInputRef.current?.click(); close(); }} styles={styles} />
                                </>
                            )}
                            {!isHidden('export') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('menu_export')} onClick={() => { props.setActiveTool?.('export'); close(); }} styles={styles} />
                                </>
                            )}
                            {!isHidden('clear') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('op_clear')} onClick={() => { props.handleClear?.(); close(); }} styles={styles} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('view') && (
                <ClassicMenuItem label={t('view')} styles={styles}>
                    {(close) => (
                        <>
                            {!isHidden('fit_view') && <ClassicSubItem label={t('menu_fit_view')} onClick={() => { props.sceneMgr?.fitView(); close(); }} styles={styles} />}
                            {!isHidden('views') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('view_front')} onClick={() => { props.handleView?.('front'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_back')} onClick={() => { props.handleView?.('back'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_top')} onClick={() => { props.handleView?.('top'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_bottom')} onClick={() => { props.handleView?.('bottom'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_left')} onClick={() => { props.handleView?.('left'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_right')} onClick={() => { props.handleView?.('right'); close(); }} styles={styles} />
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('view_se')} onClick={() => { props.handleView?.('se'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_sw')} onClick={() => { props.handleView?.('sw'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_ne')} onClick={() => { props.handleView?.('ne'); close(); }} styles={styles} />
                                    <ClassicSubItem label={t('view_nw')} onClick={() => { props.handleView?.('nw'); close(); }} styles={styles} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('interface') && (
                <ClassicMenuItem label={t('interface_display')} styles={styles}>
                    {(close) => (
                        <>
                            {!isHidden('outline') && <ClassicSubItem label={t('interface_outline')} checked={props.showOutline} onClick={() => { props.setShowOutline?.(!props.showOutline); close(); }} styles={styles} />}
                            {!isHidden('props') && <ClassicSubItem label={t('interface_props')} checked={props.showProps} onClick={() => { props.setShowProps?.(!props.showProps); close(); }} styles={styles} />}
                            {!isHidden('stats') && <ClassicSubItem label={t('st_monitor')} checked={props.showStats} onClick={() => { props.setShowStats?.(!props.showStats); close(); }} styles={styles} />}
                            {!isHidden('pick') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('op_pick')} checked={props.pickEnabled} onClick={() => { props.setPickEnabled?.(!props.pickEnabled); close(); }} styles={styles} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('tool') && (
                <ClassicMenuItem label={t('tool')} styles={styles}>
                    {(close) => (
                        <>
                            {!isHidden('measure') && <ClassicSubItem label={t('tool_measure')} onClick={() => { props.setActiveTool?.('measure'); close(); }} styles={styles} />}
                            {!isHidden('clip') && <ClassicSubItem label={t('tool_clip')} onClick={() => { props.setActiveTool?.('clip'); close(); }} styles={styles} />}
                            {!isHidden('viewpoint') && <ClassicSubItem label={t('viewpoint_title')} onClick={() => { props.setActiveTool?.('viewpoint'); close(); }} styles={styles} />}
                            {!isHidden('sun') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('st_sun_simulation')} onClick={() => { props.setActiveTool?.('sun'); close(); }} styles={styles} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('settings_panel') && (
                <ClassicMenuItem label={t('settings')} styles={styles}>
                    {(close) => (
                        <>
                            {!isHidden('settings') && <ClassicSubItem label={t('settings')} onClick={() => { props.setActiveTool?.('settings'); close(); }} styles={styles} />}
                            {!isHidden('about') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('menu_about')} onClick={() => { props.onOpenAbout?.(); close(); }} styles={styles} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}
        </div>
    );
};

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
                    bottom: '100%',
                    left: 0,
                    marginBottom: '4px',
                    backgroundColor: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
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
                            icon={<IconFile width={16} height={16} />}
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
                        icon={<IconMaximize width={16} height={16} />}
                        label={t('tb_fit')}
                        onClick={() => props.sceneMgr?.fitView()}
                        styles={styles}
                        theme={theme}
                    />
                    <div style={{ position: 'relative' }}>
                        <ImageButton 
                            icon={<IconEye width={16} height={16} />}
                            label={t('tb_view')}
                            active={openMenu === 'views'}
                            onClick={() => toggleMenu('views')}
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
                            icon={<IconBox width={16} height={16} />}
                            label={t('tb_model')}
                            active={props.showOutline}
                            onClick={() => props.setShowOutline?.(!props.showOutline)}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('props') && (
                        <ImageButton 
                            icon={<IconList width={16} height={16} />}
                            label={t('tb_props')}
                            active={props.showProps}
                            onClick={() => props.setShowProps?.(!props.showProps)}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('pick') && (
                        <ImageButton 
                            icon={<IconMousePointer width={16} height={16} />}
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
                            icon={<IconRuler width={16} height={16} />}
                            label={t('tb_measure')}
                            active={props.activeTool === 'measure'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'measure' ? 'none' : 'measure')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('clip') && (
                        <ImageButton 
                            icon={<IconScissors width={16} height={16} />}
                            label={t('tb_clip')}
                            active={props.activeTool === 'clip'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'clip' ? 'none' : 'clip')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('viewpoint') && (
                        <ImageButton 
                            icon={<IconCamera width={16} height={16} />}
                            label={t('tb_view')}
                            active={props.activeTool === 'viewpoint'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'viewpoint' ? 'none' : 'viewpoint')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('sun') && (
                        <ImageButton 
                            icon={<IconSun width={16} height={16} />}
                            label={t('st_sun_simulation')}
                            active={props.activeTool === 'sun'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'sun' ? 'none' : 'sun')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                </div>
            )}

            {!isHidden('settings_panel') && (
                <div style={styles.toolbarGroupLast}>
                    {!isHidden('settings') && (
                        <ImageButton 
                            icon={<IconSettings width={16} height={16} />}
                            label={t('tb_settings')}
                            active={props.activeTool === 'settings'}
                            onClick={() => props.setActiveTool?.(props.activeTool === 'settings' ? 'none' : 'settings')}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                    {!isHidden('about') && (
                        <ImageButton 
                            icon={<IconInfo width={16} height={16} />}
                            label={t('tb_about')}
                            onClick={() => props.onOpenAbout?.()}
                            styles={styles}
                            theme={theme}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
