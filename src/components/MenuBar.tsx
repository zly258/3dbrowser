
import React, { useState } from "react";
import { 
    IconFile, IconFolder, IconExport, IconClear, IconFit, IconWireframe, IconList, IconInfo, IconMeasure, IconSettings,
    IconPick, IconClip, IconExplode, IconMenu, IconClose
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
    activeTool?: 'none'|'measure'|'clip'|'explode'|'settings'|'export'|'views';
    setActiveTool: (tool: 'none'|'measure'|'clip'|'explode'|'settings'|'export'|'views') => void;
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
            <ToolbarButton label={t("menu_fit_view")} icon={<IconFit />} onClick={() => props.sceneMgr?.fitView()} styles={styles} />
            <ToolbarButton label={t("menu_wireframe")} icon={<IconWireframe />} active={props.wireframe} onClick={() => props.setWireframe(!props.wireframe)} styles={styles} />
            <ToolbarButton label={t("view")} icon={<IconMenu />} active={props.activeTool === 'views'} onClick={() => props.setActiveTool(props.activeTool === 'views' ? 'none' : 'views')} styles={styles} />

            <ToolbarDivider styles={styles} />

            {/* Tools */}
            <ToolbarButton label={t("op_pick")} icon={<IconPick />} active={props.pickEnabled} onClick={() => props.setPickEnabled(!props.pickEnabled)} styles={styles} />
            <ToolbarButton label={t("tool_measure")} icon={<IconMeasure />} active={props.activeTool === 'measure'} onClick={() => props.setActiveTool(props.activeTool === 'measure' ? 'none' : 'measure')} styles={styles} />
            <ToolbarButton label={t("tool_clip")} icon={<IconClip />} active={props.activeTool === 'clip'} onClick={() => props.setActiveTool(props.activeTool === 'clip' ? 'none' : 'clip')} styles={styles} />
            <ToolbarButton label={t("tool_explode")} icon={<IconExplode />} active={props.activeTool === 'explode'} onClick={() => props.setActiveTool(props.activeTool === 'explode' ? 'none' : 'explode')} styles={styles} />

        </div>
    );
};
