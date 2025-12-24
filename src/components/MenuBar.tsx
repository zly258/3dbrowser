import React, { useState } from "react";
// 移除导入 { styles } from "../Styles"
import { 
    IconFile, IconFolder, IconExport, IconClear, IconFit, IconWireframe, IconList, IconInfo, IconMeasure, IconSettings,
    IconPick, IconClip, IconExplode
} from "../theme/Icons";
import { TFunc, Lang } from "../theme/Locales";

// --- 功能区图标包装器 ---
const RibbonIcon = ({ children, styles }: { children?: React.ReactNode, styles: any }) => (
    <div style={styles.ribbonIconBox}>
        {React.isValidElement(children) 
            ? React.cloneElement(children as React.ReactElement<any>, { width: 22, height: 22 }) 
            : children}
    </div>
);

// --- Components ---
const RibbonTab = ({ label, active, onClick, styles }: { label: string, active: boolean, onClick: () => void, styles: any }) => (
    <div style={{...styles.ribbonTab, ...(active ? styles.ribbonTabActive : {})}} onClick={onClick}>
        {label}
    </div>
);

const RibbonButton = ({ label, icon, onClick, active, styles }: { label: string, icon: React.ReactNode, onClick: () => void, active?: boolean, styles: any }) => {
    const [hover, setHover] = useState(false);
    
    // 显式处理边框样式以避免渲染瑕疵
    const baseStyle: React.CSSProperties = { ...styles.ribbonBtn };
    if (active) {
        Object.assign(baseStyle, styles.ribbonBtnActive);
    } else if (hover) {
        Object.assign(baseStyle, styles.ribbonBtnHover);
    } else {
        baseStyle.backgroundColor = "transparent";
        baseStyle.borderColor = "transparent";
        baseStyle.color = styles.ribbonBtn.color;
    }

    return (
        <div style={baseStyle}
             onMouseEnter={() => setHover(true)}
             onMouseLeave={() => setHover(false)}
             onClick={onClick}
             title={label}
        >
            <RibbonIcon styles={styles}>{icon}</RibbonIcon>
            <span style={styles.ribbonLabel}>{label}</span>
        </div>
    );
};

// 紧凑网格视图的文本标签
const TextLabel = ({ text }: { text: string }) => (
    <div style={{
        width: '100%', height: '100%', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 'bold', lineHeight: 1, 
        color: '#ccc', letterSpacing: '0.5px'
    }}>
        {text}
    </div>
);

// 紧凑网格视图的小按钮
const ViewButton = ({ icon, onClick, title, styles }: { icon: React.ReactNode, onClick: () => void, title: string, styles: any }) => {
    const [hover, setHover] = useState(false);
    return (
        <div 
            style={{...styles.ribbonBtnSmall, width: '30px', ...(hover ? styles.ribbonBtnSmallHover : {})}}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onClick}
            title={title}
        >
            {icon}
        </div>
    )
}

const RibbonGroup = ({ label, children, styles }: { label: string, children?: React.ReactNode, styles: any }) => (
    <div style={styles.ribbonGroup}>
        <div style={styles.ribbonGroupContent}>
            {children}
        </div>
        <span style={styles.ribbonGroupLabel}>{label}</span>
    </div>
);

interface MenuBarProps {
    t: TFunc;
    activeMenu?: string | null; 
    setActiveMenu?: (m: string | null) => void;
    handleOpenFiles: (e: any) => void;
    handleOpenFolder: (e: any) => void;
    handleConvert: () => void; 
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
    styles: any;
    theme: any;
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
    const { t, styles } = props;
    // Default to 'home' (Start)
    const [activeTab, setActiveTab] = useState("home");

    return (
        <div style={styles.ribbonContainer}>
            {/* 1. Tabs */}
            <div style={styles.ribbonTabsRow}>
                <div style={{fontWeight:'bold', color: '#fff', marginRight: 15, padding: '2px 8px', fontSize:12}}>{t("app_title")}</div>
                <RibbonTab label={t("main_tab")} active={activeTab === "home"} onClick={() => setActiveTab("home")} styles={styles} />
                <div style={{flex:1}}></div>
            </div>

            {/* 2. Toolbar */}
            <div style={styles.ribbonToolbar}>
                
                {activeTab === "home" && (
                    <>
                        {/* File Group */}
                        <RibbonGroup label={t("grp_file")} styles={styles}>
                            <label style={{display:'flex', flexDirection:'column', height:'100%'}}>
                                <RibbonButton label={t("menu_open_file")} icon={<IconFile />} onClick={() => {}} styles={styles} />
                                <input type="file" multiple hidden accept=".lmb,.lmbz,.glb,.gltf,.ifc" onChange={props.handleOpenFiles} />
                            </label>
                            <label style={{display:'flex', flexDirection:'column', height:'100%'}}>
                                <RibbonButton label={t("menu_open_folder")} icon={<IconFolder />} onClick={() => {}} styles={styles} />
                                <input type="file" hidden {...({webkitdirectory: "", directory: ""} as any)} onChange={props.handleOpenFolder} />
                            </label>
                             <RibbonButton 
                                label={t("menu_export")} 
                                icon={<IconExport />} 
                                active={props.activeTool === 'export'}
                                onClick={() => props.setActiveTool('export')} 
                                styles={styles}
                            />
                            <RibbonButton label={t("op_clear")} icon={<IconClear />} onClick={props.handleClear} styles={styles} />
                        </RibbonGroup>
                        
                        {/* View & Display (Moved from old View tab) */}
                        <RibbonGroup label={t("grp_view")} styles={styles}>
                            <RibbonButton label={t("menu_fit_view")} icon={<IconFit />} onClick={() => props.sceneMgr?.fitView()} styles={styles} />
                            
                            {/* Grid of small view buttons */}
                            <div style={{display:'flex', gap: 2, padding:'0 4px'}}>
                                <div style={{display:'flex', flexDirection:'column', gap: 2, justifyContent: 'center'}}>
                                    <ViewButton title={t("view_top")} icon={<TextLabel text={t("btn_view_top")} />} onClick={() => props.handleView('top')} styles={styles} />
                                    <ViewButton title={t("view_bottom")} icon={<TextLabel text={t("btn_view_bottom")} />} onClick={() => props.handleView('bottom')} styles={styles} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2, justifyContent: 'center'}}>
                                    <ViewButton title={t("view_front")} icon={<TextLabel text={t("btn_view_front")} />} onClick={() => props.handleView('front')} styles={styles} />
                                    <ViewButton title={t("view_back")} icon={<TextLabel text={t("btn_view_back")} />} onClick={() => props.handleView('back')} styles={styles} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2, justifyContent: 'center'}}>
                                    <ViewButton title={t("view_left")} icon={<TextLabel text={t("btn_view_left")} />} onClick={() => props.handleView('left')} styles={styles} />
                                    <ViewButton title={t("view_right")} icon={<TextLabel text={t("btn_view_right")} />} onClick={() => props.handleView('right')} styles={styles} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2, justifyContent: 'center'}}>
                                    <ViewButton title={t("view_se")} icon={<TextLabel text={t("btn_view_iso1")} />} onClick={() => props.handleView('se')} styles={styles} />
                                    <ViewButton title={t("view_sw")} icon={<TextLabel text={t("btn_view_iso2")} />} onClick={() => props.handleView('sw')} styles={styles} />
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap: 2, justifyContent: 'center'}}>
                                    <ViewButton title={t("view_ne")} icon={<TextLabel text={t("btn_view_iso3")} />} onClick={() => props.handleView('ne')} styles={styles} />
                                    <ViewButton title={t("view_nw")} icon={<TextLabel text={t("btn_view_iso4")} />} onClick={() => props.handleView('nw')} styles={styles} />
                                </div>
                            </div>

                            <RibbonButton 
                                label={t("menu_wireframe")} 
                                icon={<IconWireframe />} 
                                active={props.wireframe}
                                onClick={() => props.setWireframe(!props.wireframe)} 
                                styles={styles}
                            />
                             <RibbonButton 
                                label={t("interface_outline")} 
                                icon={<IconList />} 
                                active={props.showOutline}
                                onClick={() => props.setShowOutline(!props.showOutline)} 
                                styles={styles}
                            />
                            <RibbonButton 
                                label={t("interface_props")} 
                                icon={<IconInfo />} 
                                active={props.showProps}
                                onClick={() => props.setShowProps(!props.showProps)} 
                                styles={styles}
                            />
                        </RibbonGroup>

                        {/* Tools and Operations */}
                        <RibbonGroup label={t("grp_tools")} styles={styles}>
                             <RibbonButton 
                                label={t("op_pick")} 
                                icon={<IconPick />} 
                                active={props.pickEnabled}
                                onClick={() => props.setPickEnabled(!props.pickEnabled)} 
                                styles={styles}
                            />
                            <RibbonButton 
                                label={t("tool_measure")} 
                                icon={<IconMeasure />} 
                                active={props.activeTool === 'measure'}
                                onClick={() => props.setActiveTool(props.activeTool === 'measure' ? 'none' : 'measure')} 
                                styles={styles}
                            />
                            <RibbonButton 
                                label={t("tool_clip")} 
                                icon={<IconClip />} 
                                active={props.activeTool === 'clip'}
                                onClick={() => props.setActiveTool(props.activeTool === 'clip' ? 'none' : 'clip')} 
                                styles={styles}
                            />
                            <RibbonButton 
                                label={t("tool_explode")} 
                                icon={<IconExplode />} 
                                active={props.activeTool === 'explode'}
                                onClick={() => props.setActiveTool(props.activeTool === 'explode' ? 'none' : 'explode')} 
                                styles={styles}
                            />
                        </RibbonGroup>

                        {/* System Settings */}
                        <RibbonGroup label={t("grp_settings")} styles={styles}>
                             <RibbonButton 
                                label={t("settings")} 
                                icon={<IconSettings />} 
                                active={props.activeTool === 'settings'}
                                onClick={() => props.setActiveTool('settings')} 
                                styles={styles}
                            />
                        </RibbonGroup>
                    </>
                )}

            </div>
        </div>
    );
};
