import React, { useState, useRef, useEffect } from "react";
import { TFunc } from "../theme/Locales";

interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    styles: any;
    theme: any;
    enabled?: boolean;
}

const ClassicMenuItem = ({ label, children, styles, theme, enabled = true }: MenuItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hover, setHover] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => {
        setIsOpen(false);
        setHover(false);
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

    const itemStyle = {
        ...styles.classicMenuItem(isOpen, hover),
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
        pointerEvents: enabled ? 'auto' : 'none' as any,
    };

    return (
        <div 
            ref={menuRef}
            style={{ position: 'relative', height: '100%' }}
            onMouseEnter={() => enabled && setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <div 
                style={itemStyle} 
                onClick={() => enabled && setIsOpen(!isOpen)}
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
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {checked !== undefined && (
                    <div style={styles.checkboxCustom(checked, hover)}>
                        {checked && <div style={styles.checkboxCheckmark}>✓</div>}
                    </div>
                )}
                {label}
            </div>
        </div>
    );
};

export const MenuBar: React.FC<any> = (props) => {
    const {
        t, styles, theme,
        hiddenMenus = [],
        disabledMenus = []
    } = props;

    const isDisabled = (id: string) => disabledMenus.includes(id);
    const isHidden = (id: string) => (hiddenMenus || []).includes(id);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

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
                ref={folderInputRef} 
                style={{ display: 'none' }} 
                {...{ webkitdirectory: "", directory: "" } as any} 
                accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges"
                onChange={props.handleOpenFolder} 
            />

            {!isHidden('file') && (
                <ClassicMenuItem label={t('menu_file')} styles={styles} theme={theme} enabled={!isDisabled('file')}>
                    {(close) => (
                        <>
                            {!isHidden('open_file') && <ClassicSubItem label={t('menu_open_file')} onClick={() => { fileInputRef.current?.click(); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('open_file')} />}
                            {!isHidden('open_folder') && <ClassicSubItem label={t('menu_open_folder')} onClick={() => { folderInputRef.current?.click(); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('open_folder')} />}
                            {!isHidden('open_url') && <ClassicSubItem label={t('menu_open_url')} onClick={() => { props.handleOpenUrl(); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('open_url')} />}
                            {!isHidden('export') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('menu_export')} onClick={() => { props.setActiveTool('export'); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('export')} />
                                </>
                            )}
                            {!isHidden('clear') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('op_clear')} onClick={() => { props.handleClear(); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('clear')} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('view') && (
                <ClassicMenuItem label={t('view')} styles={styles} theme={theme} enabled={!isDisabled('view')}>
                    {(close) => (
                        <>
                            {!isHidden('fit_view') && <ClassicSubItem label={t('menu_fit_view')} onClick={() => { props.sceneMgr?.fitView(); close(); }} styles={styles} enabled={!isDisabled('fit_view')} />}
                            {!isHidden('views') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('view_front')} onClick={() => { props.handleView('front'); close(); }} styles={styles} enabled={!isDisabled('view_front')} />
                                    <ClassicSubItem label={t('view_back')} onClick={() => { props.handleView('back'); close(); }} styles={styles} enabled={!isDisabled('view_back')} />
                                    <ClassicSubItem label={t('view_top')} onClick={() => { props.handleView('top'); close(); }} styles={styles} enabled={!isDisabled('view_top')} />
                                    <ClassicSubItem label={t('view_bottom')} onClick={() => { props.handleView('bottom'); close(); }} styles={styles} enabled={!isDisabled('view_bottom')} />
                                    <ClassicSubItem label={t('view_left')} onClick={() => { props.handleView('left'); close(); }} styles={styles} enabled={!isDisabled('view_left')} />
                                    <ClassicSubItem label={t('view_right')} onClick={() => { props.handleView('right'); close(); }} styles={styles} enabled={!isDisabled('view_right')} />
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('view_se')} onClick={() => { props.handleView('se'); close(); }} styles={styles} enabled={!isDisabled('view_se')} />
                                    <ClassicSubItem label={t('view_sw')} onClick={() => { props.handleView('sw'); close(); }} styles={styles} enabled={!isDisabled('view_sw')} />
                                    <ClassicSubItem label={t('view_ne')} onClick={() => { props.handleView('ne'); close(); }} styles={styles} enabled={!isDisabled('view_ne')} />
                                    <ClassicSubItem label={t('view_nw')} onClick={() => { props.handleView('nw'); close(); }} styles={styles} enabled={!isDisabled('view_nw')} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('interface') && (
                <ClassicMenuItem label={t('interface_display')} styles={styles} theme={theme} enabled={!isDisabled('interface')}>
                    {(close) => (
                        <>
                            {!isHidden('outline') && <ClassicSubItem label={t('interface_outline')} checked={props.showOutline} onClick={() => { props.setShowOutline(!props.showOutline); close(); }} styles={styles} enabled={!isDisabled('outline')} />}
                            {!isHidden('props') && <ClassicSubItem label={t('interface_props')} checked={props.showProps} onClick={() => { props.setShowProps(!props.showProps); close(); }} styles={styles} enabled={!isDisabled('props')} />}
                            {!isHidden('stats') && <ClassicSubItem label={t('st_monitor')} checked={props.showStats} onClick={() => { props.setShowStats(!props.showStats); close(); }} styles={styles} enabled={!isDisabled('stats')} />}
                            {!isHidden('pick') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('op_pick')} checked={props.pickEnabled} onClick={() => { props.setPickEnabled(!props.pickEnabled); close(); }} styles={styles} enabled={!isDisabled('pick')} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('tool') && (
                <ClassicMenuItem label={t('tool')} styles={styles} theme={theme} enabled={!isDisabled('tool')}>
                    {(close) => (
                        <>
                            {!isHidden('measure') && <ClassicSubItem label={t('tool_measure')} onClick={() => { props.setActiveTool('measure'); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('measure')} />}
                            {!isHidden('clip') && <ClassicSubItem label={t('tool_clip')} onClick={() => { props.setActiveTool('clip'); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('clip')} />}
                        </>
                    )}
                </ClassicMenuItem>
            )}

            {!isHidden('settings_panel') && (
                <ClassicMenuItem label={t('settings')} styles={styles} theme={theme} enabled={!isDisabled('settings_panel')}>
                    {(close) => (
                        <>
                            {!isHidden('settings') && <ClassicSubItem label={t('settings')} onClick={() => { props.setActiveTool('settings'); close(); props.handleView('se'); }} styles={styles} enabled={!isDisabled('settings')} />}
                            {!isHidden('about') && (
                                <>
                                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                                    <ClassicSubItem label={t('menu_about')} onClick={() => { props.onOpenAbout(); close(); }} styles={styles} enabled={!isDisabled('about')} />
                                </>
                            )}
                        </>
                    )}
                </ClassicMenuItem>
            )}
        </div>
    );
};
