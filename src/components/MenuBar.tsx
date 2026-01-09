
import React, { useState, useRef, useEffect } from "react";
import { 
    IconFile, IconFolder, IconExport, IconClear, IconFit, IconList, IconInfo, IconMeasure, IconSettings,
    IconPick, IconClip, IconMenu, IconClose, IconChevronRight, IconChevronDown, IconMinimize, IconMaximize, IconLang
} from "../theme/Icons";

// 尝试获取 ipcRenderer (仅在 Electron 环境下有效)
let ipcRenderer: any = null;
try {
    if (window.require) {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) {}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

// --- Components ---

const StartMenu = ({ isOpen, onClose, t, theme, handleOpenFiles, handleOpenFolder, handleAbout }: any) => {
    if (!isOpen) return null;

    const itemStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        cursor: 'pointer',
        fontSize: '13px',
        color: theme.text,
        transition: 'background-color 0.2s',
    };

    return (
        <>
            <div 
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }} 
                onClick={onClose} 
            />
            <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '240px',
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 1001,
                padding: '8px 0',
                marginTop: '1px',
                animation: 'slideIn 0.2s ease-out'
            }}>
                <div style={{ padding: '8px 16px', fontSize: '11px', color: theme.textMuted, fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {t('start_menu')}
                </div>
                <div 
                    style={itemStyle} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={() => { handleOpenFiles(); onClose(); }}
                >
                    <IconFile size={18} />
                    {t('start_open')}
                </div>
                <div 
                    style={itemStyle} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={() => { handleOpenFolder(); onClose(); }}
                >
                    <IconFolder size={18} />
                    {t('menu_open_folder')}
                </div>
                <div style={{ height: '1px', background: theme.border, margin: '8px 0' }} />
                <div 
                    style={itemStyle} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={() => { handleAbout(); onClose(); }}
                >
                    <IconInfo size={18} />
                    {t('start_about')}
                </div>
                <div 
                    style={itemStyle} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={() => { if (window.confirm(t('start_exit') + '?')) window.close(); }}
                >
                    <IconClose size={18} />
                    {t('start_exit')}
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
};

const WindowControls = ({ theme }: { theme: any }) => {
    if (!ipcRenderer || isMac) return null; // 非 Electron 环境或 macOS 不显示

    const controlStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '46px',
        height: '32px',
        cursor: 'pointer',
        WebkitAppRegion: 'no-drag' as any,
        transition: 'background-color 0.1s'
    };

    return (
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
            <div 
                style={controlStyle} 
                onClick={() => ipcRenderer.send('window-min')}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <IconMinimize width={12} height={12} />
            </div>
            <div 
                style={controlStyle} 
                onClick={() => ipcRenderer.send('window-max')}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <IconMaximize width={10} height={10} />
            </div>
            <div 
                style={{ ...controlStyle }} 
                onClick={() => ipcRenderer.send('window-close')}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E81123'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <IconClose width={12} height={12} />
            </div>
        </div>
    );
};
import { TFunc, Lang } from "../theme/Locales";
import { Checkbox } from "./ToolPanels";

interface RibbonUIProps {
    t: TFunc;
    themeType: 'dark' | 'light';
    setThemeType: (type: 'dark' | 'light') => void;
    menuMode: 'ribbon' | 'classic';
    activeTool: string;
    setActiveTool: (tool: string) => void;
    handleOpenFiles: (e: any) => void;
    handleOpenFolder: (e: any) => void;
    handleClear: () => void;
    handleView: (view: string) => void;
    pickEnabled: boolean;
    setPickEnabled: (v: boolean) => void;
    showOutline: boolean;
    setShowOutline: (v: boolean) => void;
    showProps: boolean;
    setShowProps: (v: boolean) => void;
    showStats: boolean;
    setShowStats: (v: boolean) => void;
    handleAbout: () => void;
    sceneMgr: any;
    styles: any;
    theme: any;
}

const RibbonButtonLarge = ({ icon, label, onClick, active, styles }: { icon?: React.ReactNode, label: string, onClick: () => void, active?: boolean, styles: any }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={styles.ribbonButtonLarge(active, hover)} 
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {icon && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 28 }) : icon}
                </div>
            )}
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '12px', marginTop: icon ? '2px' : '0' }}>{label}</div>
        </div>
    );
};

const RibbonButtonMedium = ({ icon, label, onClick, active, styles }: { icon?: React.ReactNode, label: string, onClick: () => void, active?: boolean, styles: any }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={{
                ...styles.ribbonButtonMedium(active, hover),
                gap: icon ? '6px' : '0',
                padding: icon ? '2px 8px' : '2px 10px'
            }} 
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {icon && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 16 }) : icon}
                </div>
            )}
            <span style={{ fontSize: '12px', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>
        </div>
    );
};

const RibbonButtonSmall = ({ icon, onClick, active, styles, title }: { icon?: React.ReactNode, onClick: () => void, active?: boolean, styles: any, title?: string }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={styles.ribbonButtonSmall(active, hover)} 
            onClick={onClick} 
            title={title}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {icon && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 16 }) : icon}
                </div>
            )}
        </div>
    );
};

const RibbonCheckbox = ({ label, checked, onChange, styles, theme }: { label: string, checked: boolean, onChange: (v: boolean) => void, styles: any, theme: any }) => (
    <div style={styles.ribbonCheckbox}>
        <Checkbox 
            label={label} 
            checked={checked} 
            onChange={onChange} 
            styles={styles} 
            theme={theme} 
            style={{ padding: 0, fontSize: '11px', gap: '6px' }} 
        />
    </div>
);

const RibbonPanel = ({ label, children, styles }: { label: string, children: React.ReactNode, styles: any }) => (
    <div style={styles.ribbonPanel}>
        <div style={styles.ribbonPanelContent}>
            {children}
        </div>
        <div style={styles.ribbonPanelLabel}>{label}</div>
    </div>
);

const ClassicMenuItem = ({ label, children, styles, theme }: { label: string, children: (close: () => void) => React.ReactNode, styles: any, theme: any }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hover, setHover] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => setIsOpen(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div 
            ref={menuRef}
            style={{ position: 'relative', height: '100%' }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <div 
                style={styles.classicMenuItem(isOpen, hover)} 
                onClick={() => setIsOpen(!isOpen)}
            >
                {label}
            </div>
            {isOpen && (
                <div style={styles.classicMenuDropdown}>
                    {children(closeMenu)}
                </div>
            )}
        </div>
    );
};

const ClassicSubItem = ({ label, onClick, styles }: { label: string, onClick: () => void, styles: any }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={styles.classicMenuSubItem(hover)}
            onClick={() => { onClick(); }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {label}
        </div>
    );
};

export const MenuBar: React.FC<RibbonUIProps> = (props) => {
    const { t, styles, theme } = props;
    const [activeTab, setActiveTab] = useState('home');
    const [showStartMenu, setShowStartMenu] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div style={styles.ribbonContainer}>
            {/* Title Bar */}
            <div style={styles.ribbonTitleBar}>
                {isMac && <div style={{ width: '80px' }} />}
                <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' as any }}>
                    <div 
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '100%',
                            borderRight: `1px solid ${theme.border}40`
                        }}
                    >
                        <div style={{ 
                            width: '24px', height: '24px', 
                            background: `linear-gradient(135deg, ${theme.accent}, #60a5fa)`, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 'bold', fontSize: '12px',
                            borderRadius: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}>3D</div>
                        <span style={{ fontWeight: '700', color: theme.text, fontSize: '14px', letterSpacing: '0.5px' }}>3D BROWSER</span>
                    </div>
                </div>
                <div style={{ 
                    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                    fontSize: '12px', color: theme.textMuted, pointerEvents: 'none',
                    fontWeight: '500'
                }}>
                    {t('app_title')}
                </div>
                <WindowControls theme={theme} />
            </div>

            {/* Tabs */}
            {props.menuMode === 'ribbon' && (
                <div style={{...styles.ribbonTabs, paddingLeft: '4px'}}>
                    <div style={{ position: 'relative' }}>
                        <div style={styles.ribbonTab(showStartMenu, true)} onClick={() => setShowStartMenu(!showStartMenu)}>{t('menu_file')}</div>
                        <StartMenu 
                            isOpen={showStartMenu} 
                            onClose={() => setShowStartMenu(false)} 
                            t={t} 
                            theme={theme} 
                            handleOpenFiles={() => fileInputRef.current?.click()}
                            handleOpenFolder={() => folderInputRef.current?.click()}
                            handleAbout={props.handleAbout}
                        />
                    </div>
                    <div style={styles.ribbonTab(activeTab === 'home')} onClick={() => setActiveTab('home')}>{t('home')}</div>
                    <div style={styles.ribbonTab(activeTab === 'view')} onClick={() => setActiveTab('view')}>{t('view')}</div>
                </div>
            )}

            {/* Ribbon Content or Classic Menu */}
            <input ref={fileInputRef} type="file" multiple hidden accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3mf" onChange={props.handleOpenFiles} />
            <input ref={folderInputRef} type="file" hidden {...({webkitdirectory: "", directory: ""} as any)} onChange={props.handleOpenFolder} />
            
            {props.menuMode === 'ribbon' ? (
                <div style={styles.ribbonContent}>
                    {activeTab === 'home' && (
                        <>
                            <RibbonPanel label={t('menu_file')} styles={styles}>
                                <div style={styles.ribbonPanelRows}>
                                    <RibbonButtonMedium icon={<IconFile />} label={t('menu_open_file')} onClick={() => fileInputRef.current?.click()} styles={styles} />
                                    <RibbonButtonMedium icon={<IconFolder />} label={t('menu_open_folder')} onClick={() => folderInputRef.current?.click()} styles={styles} />
                                    <RibbonButtonMedium icon={<IconClear />} label={t('op_clear')} onClick={props.handleClear} styles={styles} />
                                <RibbonButtonMedium icon={<IconExport />} label={t('menu_export')} onClick={() => props.setActiveTool('export')} active={props.activeTool === 'export'} styles={styles} />
                                </div>
                            </RibbonPanel>

                            <RibbonPanel label={t('view')} styles={styles}>
                                <RibbonButtonLarge icon={<IconFit />} label={t('menu_fit_view')} onClick={() => props.sceneMgr?.fitView()} styles={styles} />
                                <RibbonButtonLarge icon={<IconPick />} label={t('op_pick')} onClick={() => props.setPickEnabled(!props.pickEnabled)} active={props.pickEnabled} styles={styles} />
                                <div style={styles.ribbonPanelRows}>
                                    <RibbonButtonMedium  label={t('view_front')} onClick={() => props.handleView('front')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_back')} onClick={() => props.handleView('back')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_top')} onClick={() => props.handleView('top')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_bottom')} onClick={() => props.handleView('bottom')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_left')} onClick={() => props.handleView('left')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_right')} onClick={() => props.handleView('right')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_se')} onClick={() => props.handleView('se')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_sw')} onClick={() => props.handleView('sw')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_ne')} onClick={() => props.handleView('ne')} styles={styles} />
                                    <RibbonButtonMedium  label={t('view_nw')} onClick={() => props.handleView('nw')} styles={styles} />
                                </div>
                            </RibbonPanel>

                            <RibbonPanel label={t('interface_display')} styles={styles}>
                                <div style={styles.ribbonPanelRows}>
                                    <RibbonCheckbox label={t('interface_outline')} checked={props.showOutline} onChange={props.setShowOutline} styles={styles} theme={theme} />
                                    <RibbonCheckbox label={t('interface_props')} checked={props.showProps} onChange={props.setShowProps} styles={styles} theme={theme} />
                                    <RibbonCheckbox label={t('st_monitor')} checked={props.showStats} onChange={props.setShowStats} styles={styles} theme={theme} />
                                </div>
                            </RibbonPanel>

                            <RibbonPanel label={t('tool')} styles={styles}>
                                <div style={styles.ribbonPanelRows}>
                                    <RibbonButtonMedium icon={<IconMeasure />} label={t('tool_measure')} onClick={() => props.setActiveTool('measure')} active={props.activeTool === 'measure'} styles={styles} />
                                    <RibbonButtonMedium icon={<IconClip />} label={t('tool_clip')} onClick={() => props.setActiveTool('clip')} active={props.activeTool === 'clip'} styles={styles} />
                                </div>
                            </RibbonPanel>

                            <RibbonPanel label={t('settings')} styles={styles}>
                                <div style={styles.ribbonPanelRows}>
                                    <RibbonButtonMedium icon={<IconSettings />} label={t('settings')} onClick={() => props.setActiveTool('settings')} active={props.activeTool === 'settings'} styles={styles} />
                                    <RibbonButtonMedium icon={<IconInfo />} label={t('about')} onClick={props.handleAbout} styles={styles} />
                                </div>
                            </RibbonPanel>
                        </>
                    )}
                </div>
            ) : (
                <div style={styles.classicMenuBar}>
                    <ClassicMenuItem label={t('menu_file')} styles={styles} theme={theme}>
                        {(close) => (
                            <>
                                <ClassicSubItem label={t('menu_open_file')} onClick={() => { fileInputRef.current?.click(); close(); }} styles={styles} />
                                <ClassicSubItem label={t('menu_open_folder')} onClick={() => { folderInputRef.current?.click(); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={t('menu_export')} onClick={() => { props.setActiveTool('export'); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={t('op_clear')} onClick={() => { props.handleClear(); close(); }} styles={styles} />
                            </>
                        )}
                    </ClassicMenuItem>

                    <ClassicMenuItem label={t('view')} styles={styles} theme={theme}>
                        {(close) => (
                            <>
                                <ClassicSubItem label={t('menu_fit_view')} onClick={() => { props.sceneMgr?.fitView(); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={t('view_front')} onClick={() => { props.handleView('front'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_back')} onClick={() => { props.handleView('back'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_top')} onClick={() => { props.handleView('top'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_bottom')} onClick={() => { props.handleView('bottom'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_left')} onClick={() => { props.handleView('left'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_right')} onClick={() => { props.handleView('right'); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={t('view_se')} onClick={() => { props.handleView('se'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_sw')} onClick={() => { props.handleView('sw'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_ne')} onClick={() => { props.handleView('ne'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('view_nw')} onClick={() => { props.handleView('nw'); close(); }} styles={styles} />
                            </>
                        )}
                    </ClassicMenuItem>

                    <ClassicMenuItem label={t('interface_display')} styles={styles} theme={theme}>
                        {(close) => (
                            <>
                                <ClassicSubItem label={`${props.showOutline ? '✓ ' : ''}${t('interface_outline')}`} onClick={() => { props.setShowOutline(!props.showOutline); close(); }} styles={styles} />
                                <ClassicSubItem label={`${props.showProps ? '✓ ' : ''}${t('interface_props')}`} onClick={() => { props.setShowProps(!props.showProps); close(); }} styles={styles} />
                                <ClassicSubItem label={`${props.showStats ? '✓ ' : ''}${t('st_monitor')}`} onClick={() => { props.setShowStats(!props.showStats); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={`${props.pickEnabled ? '✓ ' : ''}${t('op_pick')}`} onClick={() => { props.setPickEnabled(!props.pickEnabled); close(); }} styles={styles} />
                            </>
                        )}
                    </ClassicMenuItem>

                    <ClassicMenuItem label={t('tool')} styles={styles} theme={theme}>
                        {(close) => (
                            <>
                                <ClassicSubItem label={t('tool_measure')} onClick={() => { props.setActiveTool('measure'); close(); }} styles={styles} />
                                <ClassicSubItem label={t('tool_clip')} onClick={() => { props.setActiveTool('clip'); close(); }} styles={styles} />
                            </>
                        )}
                    </ClassicMenuItem>

                    <ClassicMenuItem label={t('settings')} styles={styles} theme={theme}>
                        {(close) => (
                            <>
                                <ClassicSubItem label={t('settings')} onClick={() => { props.setActiveTool('settings'); close(); }} styles={styles} />
                                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                <ClassicSubItem label={t('about')} onClick={() => { props.handleAbout(); close(); }} styles={styles} />
                            </>
                        )}
                    </ClassicMenuItem>
                </div>
            )}
        </div>
    );
};
