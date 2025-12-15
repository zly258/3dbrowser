

import React, { useState } from "react";
import { styles } from "../Styles";
import { IconFile, IconFolder, IconConvert, IconClear, IconLang, IconFit, IconMesh, IconTiles, IconList, IconInfo, IconStats, IconSettings } from "../Icons";
import { TFunc, Lang } from "../Locales";

// --- Icons wrapper for Ribbon (svg scaling) ---
const RibbonIcon = ({ children }: { children?: React.ReactNode }) => (
    <div style={styles.ribbonIconBox}>
        {React.isValidElement(children) 
            ? React.cloneElement(children as React.ReactElement<any>, { width: 18, height: 18 }) 
            : children}
    </div>
);

// --- Components ---
const RibbonTab = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <div style={{...styles.ribbonTab, ...(active ? styles.ribbonTabActive : {})}} onClick={onClick}>
        {label}
    </div>
);

const RibbonButton = ({ label, icon, onClick, active }: { label: string, icon: React.ReactNode, onClick: () => void, active?: boolean }) => {
    const [hover, setHover] = useState(false);
    
    // Explicitly handle border style to avoid artifacts
    const baseStyle: React.CSSProperties = { ...styles.ribbonBtn };
    if (active) {
        Object.assign(baseStyle, styles.ribbonBtnActive);
    } else if (hover) {
        Object.assign(baseStyle, styles.ribbonBtnHover);
    } else {
        // Ensure reset
        baseStyle.backgroundColor = "transparent";
        baseStyle.borderColor = "transparent";
        baseStyle.color = styles.ribbonBtn.color;
    }

    return (
        <div style={baseStyle}
             onMouseEnter={() => setHover(true)}
             onMouseLeave={() => setHover(false)}
             onClick={onClick}
        >
            <RibbonIcon>{icon}</RibbonIcon>
            <span style={styles.ribbonLabel}>{label}</span>
        </div>
    );
};

const ViewButton = ({ label, onClick }: { label: string, onClick: () => void }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={{...styles.ribbonBtnSmall, ...(hover ? { backgroundColor: '#4f4f4f' } : {})}}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onClick}
        >
            {label}
        </div>
    )
}

const RibbonGroup = ({ children }: { children?: React.ReactNode }) => (
    <div style={styles.ribbonGroup}>{children}</div>
);

interface MenuBarProps {
    t: TFunc;
    activeMenu?: string | null; // Legacy prop, unused in ribbon
    setActiveMenu?: (m: string | null) => void;
    handleOpenFiles: (e: any) => void;
    handleOpenFolder: (e: any) => void;
    handleConvert: () => void; // Used for "Export" now
    handleView: (v: string) => void;
    handleClear: () => void;
    pickEnabled: boolean;
    setPickEnabled: (v: boolean) => void;
    activeTool?: 'none'|'measure'|'clip'|'explode'|'settings'|'export';
    setActiveTool: (tool: 'none'|'measure'|'clip'|'explode'|'settings'|'export') => void;
    showOutline: boolean;
    setShowOutline: (v: boolean) => void;
    showProps: boolean;
    setShowProps: (v: boolean) => void;
    setLang: React.Dispatch<React.SetStateAction<Lang>>;
    sceneMgr: any; 
    wireframe: boolean;
    setWireframe: (v: boolean) => void;
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
    const { t } = props;
    const [activeTab, setActiveTab] = useState("home");

    return (
        <div style={styles.ribbonContainer}>
            {/* 1. Tabs */}
            <div style={styles.ribbonTabsRow}>
                <div style={{fontWeight:'bold', color: '#fff', marginRight: 15, padding: '2px 8px', fontSize:12}}>{t("app_title")}</div>
                <RibbonTab label={t("file")} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
                <RibbonTab label={t("view")} active={activeTab === "view"} onClick={() => setActiveTab("view")} />
                <RibbonTab label={t("tools")} active={activeTab === "tools"} onClick={() => setActiveTab("tools")} />
                <RibbonTab label={t("settings")} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
                <div style={{flex:1}}></div>
            </div>

            {/* 2. Toolbar */}
            <div style={styles.ribbonToolbar}>
                
                {activeTab === "home" && (
                    <>
                        <RibbonGroup>
                            <label style={{display:'flex', flexDirection:'column', height:'100%'}}>
                                <RibbonButton label={t("menu_open_file")} icon={<IconFile />} onClick={() => {}} />
                                <input type="file" multiple hidden accept=".lmb,.lmbz,.glb,.gltf" onChange={props.handleOpenFiles} />
                            </label>
                            <label style={{display:'flex', flexDirection:'column', height:'100%'}}>
                                <RibbonButton label={t("menu_open_folder")} icon={<IconFolder />} onClick={() => {}} />
                                <input type="file" hidden {...({webkitdirectory: "", directory: ""} as any)} onChange={props.handleOpenFolder} />
                            </label>
                        </RibbonGroup>
                        <RibbonGroup>
                            {/* Changed to Export and uses setActiveTool */}
                            <RibbonButton 
                                label={t("menu_export")} 
                                icon={<IconConvert />} 
                                active={props.activeTool === 'export'}
                                onClick={() => props.setActiveTool('export')} 
                            />
                        </RibbonGroup>
                        <RibbonGroup>
                            <RibbonButton label={t("op_clear")} icon={<IconClear />} onClick={props.handleClear} />
                        </RibbonGroup>
                    </>
                )}

                {activeTab === "view" && (
                    <>
                        <RibbonGroup>
                            <RibbonButton label={t("menu_fit_view")} icon={<IconFit />} onClick={() => props.sceneMgr?.fitView()} />
                        </RibbonGroup>
                        <RibbonGroup>
                            <div style={{display:'flex', gap: 4}}>
                                <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                                    <ViewButton label={t("view_top")} onClick={() => props.handleView('top')} />
                                    <ViewButton label={t("view_bottom")} onClick={() => props.handleView('bottom')} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                                    <ViewButton label={t("view_front")} onClick={() => props.handleView('front')} />
                                    <ViewButton label={t("view_back")} onClick={() => props.handleView('back')} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                                    <ViewButton label={t("view_left")} onClick={() => props.handleView('left')} />
                                    <ViewButton label={t("view_right")} onClick={() => props.handleView('right')} />
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup>
                            <div style={{display:'flex', gap: 4}}>
                                <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                                    <ViewButton label={t("view_se")} onClick={() => props.handleView('se')} />
                                    <ViewButton label={t("view_sw")} onClick={() => props.handleView('sw')} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                                    <ViewButton label={t("view_ne")} onClick={() => props.handleView('ne')} />
                                    <ViewButton label={t("view_nw")} onClick={() => props.handleView('nw')} />
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup>
                             <RibbonButton 
                                label={t("menu_wireframe")} 
                                icon={<IconMesh />} 
                                active={props.wireframe}
                                onClick={() => props.setWireframe(!props.wireframe)} 
                            />
                             <RibbonButton 
                                label={t("interface_outline")} 
                                icon={<IconList />} 
                                active={props.showOutline}
                                onClick={() => props.setShowOutline(!props.showOutline)} 
                            />
                            <RibbonButton 
                                label={t("interface_props")} 
                                icon={<IconInfo />} 
                                active={props.showProps}
                                onClick={() => props.setShowProps(!props.showProps)} 
                            />
                        </RibbonGroup>
                    </>
                )}

                {activeTab === "tools" && (
                    <>
                        <RibbonGroup>
                             <RibbonButton 
                                label={t("op_pick")} 
                                icon={<IconMesh />} 
                                active={props.pickEnabled}
                                onClick={() => props.setPickEnabled(!props.pickEnabled)} 
                            />
                        </RibbonGroup>
                        <RibbonGroup>
                            <RibbonButton 
                                label={t("tool_measure")} 
                                icon={<IconStats />} 
                                active={props.activeTool === 'measure'}
                                onClick={() => props.setActiveTool('measure')} 
                            />
                            <RibbonButton 
                                label={t("tool_clip")} 
                                icon={<IconTiles />} 
                                active={props.activeTool === 'clip'}
                                onClick={() => props.setActiveTool('clip')} 
                            />
                            <RibbonButton 
                                label={t("tool_explode")} 
                                icon={<IconMesh />} 
                                active={props.activeTool === 'explode'}
                                onClick={() => props.setActiveTool('explode')} 
                            />
                        </RibbonGroup>
                    </>
                )}
                
                {activeTab === "settings" && (
                    <RibbonGroup>
                        <RibbonButton 
                            label={t("setting_general")} 
                            icon={<IconSettings />} 
                            active={props.activeTool === 'settings'}
                            onClick={() => props.setActiveTool('settings')} 
                        />
                    </RibbonGroup>
                )}

            </div>
        </div>
    );
};
