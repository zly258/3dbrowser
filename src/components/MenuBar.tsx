
import React, { useState, useRef, useEffect } from "react";
import { 
    IconFile, IconFolder, IconExport, IconClear, IconFit, IconWireframe, IconList, IconInfo, IconMeasure, IconSettings,
    IconPick, IconClip, IconMenu, IconClose, IconChevronRight, IconChevronDown
} from "../theme/Icons";
import { TFunc, Lang } from "../theme/Locales";

// --- Components ---

const ToolbarDivider = ({ styles }: { styles: any }) => (
    <div style={styles.toolbarDivider} />
);

const ToolbarButton = ({ label, icon, onClick, active, styles }: { label: string, icon: React.ReactNode, onClick: () => void, active?: boolean, styles: any }) => {
    const [hover, setHover] = useState(false);
    
    const btnStyle = { ...styles.toolbarBtn };
    if (active) Object.assign(btnStyle, styles.toolbarBtnActive);
    else if (hover) Object.assign(btnStyle, styles.toolbarBtnHover);

    return (
        <button 
            style={btnStyle}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onClick}
            title={label}
        >
            {React.isValidElement(icon) 
                ? React.cloneElement(icon as React.ReactElement<any>, { width: 20, height: 20 }) 
                : icon}
        </button>
    );
};

const MenuOption = ({ label, onClick, active, theme }: { label: string, onClick: () => void, active?: boolean, theme: any }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: active ? theme.accent : theme.text,
                backgroundColor: hover ? theme.itemHover : 'transparent',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap'
            }}
        >
            {label}
        </div>
    );
};

// --- Props ---

interface MenuBarProps {
    t: TFunc;
    handleOpenFiles: (e: any) => void;
    handleOpenFolder: (e: any) => void;
    handleConvert: () => void; 
    handleView: (v: string) => void;
    handleClear: () => void;
    pickEnabled: boolean;
    setPickEnabled: (v: boolean) => void;
    activeTool?: 'none'|'measure'|'clip'|'settings'|'export'|'views';
    setActiveTool: (tool: 'none'|'measure'|'clip'|'settings'|'export'|'views') => void;
    showOutline: boolean;
    setShowOutline: (v: boolean) => void;
    showProps: boolean;
    setShowProps: (v: boolean) => void;
    setLang: React.Dispatch<React.SetStateAction<Lang>>;
    sceneMgr: any; 
    wireframe: boolean;
    setWireframe: (v: boolean) => void;
    styles: any;
    theme: any;
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
    const { t, theme, styles } = props;
    const [showViewMenu, setShowViewMenu] = useState(false);
    const viewMenuRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
                setShowViewMenu(false);
            }
        };
        if (showViewMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showViewMenu]);

    const handleViewClick = (view: string) => {
        if (view === 'fit') {
            props.sceneMgr?.fitView();
        } else {
            props.handleView(view);
        }
        setShowViewMenu(false);
    };
    
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div style={styles.toolbarContainer}>
            {/* File Operations */}
            <ToolbarButton label={t("menu_open_file")} icon={<IconFile />} onClick={() => fileInputRef.current?.click()} styles={styles} />
            <input 
                ref={fileInputRef} 
                type="file" multiple hidden accept=".lmb,.lmbz,.glb,.gltf,.ifc,.nbim" 
                onChange={props.handleOpenFiles} 
            />
            
            <ToolbarButton label={t("menu_open_folder")} icon={<IconFolder />} onClick={() => folderInputRef.current?.click()} styles={styles} />
            <input 
                ref={folderInputRef} 
                type="file" hidden {...({webkitdirectory: "", directory: ""} as any)} 
                onChange={props.handleOpenFolder} 
            />
            
            <ToolbarButton label={t("menu_export")} icon={<IconExport />} active={props.activeTool === 'export'} onClick={() => props.setActiveTool(props.activeTool === 'export' ? 'none' : 'export')} styles={styles} />
            <ToolbarButton label={t("op_clear")} icon={<IconClear />} onClick={props.handleClear} styles={styles} />
            
            <ToolbarDivider styles={styles} />

            {/* View / Panels */}
            <ToolbarButton label={t("interface_outline")} icon={<IconList />} active={props.showOutline} onClick={() => props.setShowOutline(!props.showOutline)} styles={styles} />
            <ToolbarButton label={t("interface_props")} icon={<IconInfo />} active={props.showProps} onClick={() => props.setShowProps(!props.showProps)} styles={styles} />
            <ToolbarButton label={t("settings")} icon={<IconSettings />} active={props.activeTool === 'settings'} onClick={() => props.setActiveTool(props.activeTool === 'settings' ? 'none' : 'settings')} styles={styles} />

            <ToolbarDivider styles={styles} />

            {/* Display Ops */}
            <div style={{ position: 'relative' }} ref={viewMenuRef}>
                <ToolbarButton 
                    label={t("view")} 
                    icon={<IconMenu />} 
                    active={showViewMenu} 
                    onClick={() => setShowViewMenu(!showViewMenu)} 
                    styles={styles} 
                />
                {showViewMenu && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: '8px',
                        backgroundColor: theme.panelBg,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        padding: '4px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '4px',
                        minWidth: '200px',
                        zIndex: 1000
                    }}>
                        <MenuOption label={t("view_top")} onClick={() => handleViewClick('top')} theme={theme} />
                        <MenuOption label={t("view_bottom")} onClick={() => handleViewClick('bottom')} theme={theme} />
                        <MenuOption label={t("view_front")} onClick={() => handleViewClick('front')} theme={theme} />
                        <MenuOption label={t("view_back")} onClick={() => handleViewClick('back')} theme={theme} />
                        <MenuOption label={t("view_left")} onClick={() => handleViewClick('left')} theme={theme} />
                        <MenuOption label={t("view_right")} onClick={() => handleViewClick('right')} theme={theme} />
                        <MenuOption label={t("view_se")} onClick={() => handleViewClick('iso1')} theme={theme} />
                        <MenuOption label={t("view_sw")} onClick={() => handleViewClick('iso2')} theme={theme} />
                        <MenuOption label={t("view_ne")} onClick={() => handleViewClick('iso3')} theme={theme} />
                        <MenuOption label={t("view_nw")} onClick={() => handleViewClick('iso4')} theme={theme} />
                        <div style={{ gridColumn: 'span 2', height: '1px', backgroundColor: theme.border, margin: '2px 0' }} />
                        <MenuOption label={t("menu_fit_view")} onClick={() => handleViewClick('fit')} theme={theme} />
                        <MenuOption 
                            label={t("menu_wireframe")} 
                            active={props.wireframe}
                            onClick={() => { props.setWireframe(!props.wireframe); setShowViewMenu(false); }} 
                            theme={theme} 
                        />
                    </div>
                )}
            </div>

            <ToolbarDivider styles={styles} />

            {/* Tools */}
            <ToolbarButton label={t("op_pick")} icon={<IconPick />} active={props.pickEnabled} onClick={() => props.setPickEnabled(!props.pickEnabled)} styles={styles} />
            <ToolbarButton label={t("tool_measure")} icon={<IconMeasure />} active={props.activeTool === 'measure'} onClick={() => props.setActiveTool(props.activeTool === 'measure' ? 'none' : 'measure')} styles={styles} />
            <ToolbarButton label={t("tool_clip")} icon={<IconClip />} active={props.activeTool === 'clip'} onClick={() => props.setActiveTool(props.activeTool === 'clip' ? 'none' : 'clip')} styles={styles} />

        </div>
    );
};
