
export interface ThemeColors {
    bg: string;
    panelBg: string;
    headerBg: string;
    border: string;
    text: string;
    textLight: string;
    textMuted: string;
    accent: string;
    highlight: string;
    itemHover: string;
    success: string;
    warning: string;
    danger: string;
    canvasBg: string;
    shadow: string;
}

export const themes: Record<'dark' | 'light', ThemeColors> = {
    dark: {
        bg: "#1b1b1c",
        panelBg: "#252526",
        headerBg: "#2d2d30",
        border: "#3f3f46",
        text: "#f1f1f1",
        textLight: "#ffffff",
        textMuted: "#999999",
        accent: "#007acc", 
        highlight: "#3e3e42",
        itemHover: "rgba(255, 255, 255, 0.1)",
        success: "#4ec9b0",
        warning: "#ce9178",
        danger: "#f48771",
        canvasBg: "#1e1e1e",
        shadow: "rgba(0, 0, 0, 0.5)"
    },
    light: {
        bg: "#ffffff", // Office 2013 White
        panelBg: "#ffffff",
        headerBg: "#f3f3f3", // Light gray for tabs area
        border: "#d2d2d2", // Office 2013 border color
        text: "#444444",
        textLight: "#000000",
        textMuted: "#666666",
        accent: "#2b579a", // Office 2013 Blue (Word style)
        highlight: "#cfe3ff",
        itemHover: "#e1e1e1",
        success: "#217346", // Excel green
        warning: "#d24726", // PPT orange
        danger: "#a4262c",
        canvasBg: "#ffffff",
        shadow: "rgba(0, 0, 0, 0.15)"
    }
};

export const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";

export const createGlobalStyle = (theme: ThemeColors) => `
    @keyframes fadeInDown {
        from { opacity: 0; transform: translate(-50%, -20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes slideInRight {
        from { opacity: 0; transform: translateX(100%); }
        to { opacity: 1; transform: translateX(0); }
    }
    ::-webkit-scrollbar { width: 12px; height: 12px; }
    ::-webkit-scrollbar-track { background: ${theme.bg}; }
    ::-webkit-scrollbar-thumb { background: #c2c2c2; border: 3px solid ${theme.bg}; border-radius: 0px; }
    ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
    ::-webkit-scrollbar-corner { background: ${theme.bg}; }
    * { scrollbar-width: thin; scrollbar-color: #c2c2c2 ${theme.bg}; }
    body { background-color: ${theme.bg}; color: ${theme.text}; margin: 0; padding: 0; overflow: hidden; font-family: ${DEFAULT_FONT}; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
`;

export const createStyles = (theme: ThemeColors) => ({
    // Desktop / Shared
    container: { display: "flex", flexDirection: "column" as const, height: "100%", width: "100%", backgroundColor: theme.bg, color: theme.text, fontSize: "11px", fontFamily: DEFAULT_FONT, userSelect: "none" as const, overflow: "hidden" },
    
    // Classic Menu Styles
    classicMenuBar: {
        display: "flex",
        alignItems: "center",
        backgroundColor: theme.bg,
        borderBottom: `1px solid ${theme.border}`,
        padding: "0 8px",
        height: "28px",
        gap: "4px",
        WebkitAppRegion: "no-drag" as any,
    },
    classicMenuItem: (active: boolean, hover: boolean) => ({
        padding: "0 10px",
        height: "100%",
        display: "flex",
        alignItems: "center",
        fontSize: "12px",
        color: theme.text,
        cursor: "pointer",
        backgroundColor: active ? theme.highlight : (hover ? "rgba(128, 128, 128, 0.1)" : "transparent"),
        transition: "background-color 0.1s",
    }),
    classicMenuDropdown: {
        position: "absolute" as const,
        top: "100%",
        left: 0,
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 2000,
        minWidth: "160px",
        padding: "4px 0",
    },
    classicMenuSubItem: (hover: boolean) => ({
        padding: "6px 16px",
        fontSize: "12px",
        color: theme.text,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: hover ? theme.itemHover : "transparent",
    }),
    
    statusBar: {
        height: "24px",
        backgroundColor: "#ffffff",
        color: "#444444",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        fontSize: "12px",
        justifyContent: "space-between",
        borderTop: `1px solid ${theme.border}`,
    },
    statusBarRight: {
        display: "flex",
        alignItems: "center",
        gap: "16px"
    },
    statusMonitorItem: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "'Segoe UI', monospace",
        opacity: 0.9
    },

    toolbarBtn: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "0px", 
        cursor: "pointer",
        color: theme.textMuted,
        backgroundColor: "transparent",
        transition: "all 0.1s ease",
        border: "none", 
        outline: "none",
        position: "relative" as const,
        WebkitAppRegion: "no-drag" as any,
    },
    toolbarBtnHover: {
        backgroundColor: theme.itemHover,
        color: theme.text,
    },
    // Checkbox Style
    checkboxContainer: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        cursor: "pointer",
        userSelect: "none" as const,
        fontSize: "12px",
        color: theme.text,
        padding: "2px 0",
    },
    checkboxCustom: (checked: boolean) => ({
        width: "16px",
        height: "16px",
        borderRadius: "2px",
        border: `1px solid ${checked ? theme.accent : theme.border}`,
        backgroundColor: checked ? theme.accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s ease",
        position: "relative" as const,
        cursor: 'pointer'
    }),
    checkboxCheckmark: {
        width: "10px",
        height: "10px",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    floatingPanel: {
        position: 'absolute' as const,
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.bg === '#ffffff' ? '0 10px 30px rgba(0,0,0,0.1)' : '0 10px 30px rgba(0,0,0,0.4)', 
        borderRadius: "4px", 
        display: "flex",
        flexDirection: "column" as const,
        zIndex: 200,
        minWidth: '220px',
        minHeight: '120px',
        overflow: 'hidden',
        color: theme.text,
    },
    floatingHeader: {
        padding: "8px 12px", 
        backgroundColor: theme.headerBg, 
        borderBottom: `1px solid ${theme.border}`,
        cursor: "default",
        fontWeight: "600",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none" as const,
        fontSize: "12px",
        color: theme.text,
    },
    floatingContent: {
        padding: "0", 
        overflowY: "auto" as const,
        flex: 1,
        position: "relative" as const,
        display: 'flex',            
        flexDirection: 'column' as const 
    },
    resizeHandle: {
        position: 'absolute' as const,
        bottom: 0,
        right: 0,
        width: '12px',
        height: '12px',
        cursor: 'se-resize',
        zIndex: 10,
        background: 'transparent'
    },

    // Tree Styles
    treeContainer: {
        flex: 1,              
        height: "100%",       
        overflowY: "auto" as const,
        overflowX: "hidden" as const,
        padding: "2px 0"
    },
    treeNode: {
        display: "flex",
        alignItems: "center",
        height: "24px",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        fontSize: "12px",
        color: theme.text,
        transition: "background-color 0.1s ease",
        paddingRight: "8px"
    },
    treeNodeSelected: {
        backgroundColor: theme.highlight, 
        color: theme.accent,
        fontWeight: '600',
    },
    expander: {
        width: "20px",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: theme.textMuted
    },
    nodeLabel: {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis"
    },

    // Properties
    list: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "0",
        userSelect: "text" as const
    },
    propGroupTitle: {
        backgroundColor: theme.headerBg, 
        padding: "4px 12px", 
        fontWeight: "600" as const,
        fontSize: "11px",
        color: theme.text,
        borderBottom: `1px solid ${theme.border}`,
        borderTop: `1px solid ${theme.border}`,
        marginTop: "-1px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        userSelect: "none" as const,
    },
    propRow: {
        display: "flex",
        padding: "4px 12px",
        borderBottom: `1px solid ${theme.border}40`,
        alignItems: "center",
        fontSize: "11px",
        gap: "8px"
    },
    propKey: {
        width: "40%",
        color: theme.textMuted,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const
    },
    propValue: {
        width: "60%",
        color: theme.text,
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "text"
    },
    
    // UI Elements
    btn: {
        backgroundColor: theme.bg,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        padding: "4px 12px",
        cursor: "pointer",
        borderRadius: "0px",
        fontSize: "12px",
        fontWeight: "400",
        transition: "all 0.1s",
        outline: "none",
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnActive: {
        backgroundColor: theme.accent,
        color: "#ffffff",
        borderColor: theme.accent,
    },
    
    // View Grid Button
    viewGridBtn: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '0px',
        padding: '4px',
        cursor: 'pointer',
        transition: 'all 0.1s',
        color: theme.text,
        fontSize: '11px',
        height: '56px',
        gap: '4px'
    },
    
    // Modal Overlay
    modalOverlay: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.bg === '#ffffff' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000
    },
    modalContent: {
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.accent}`,
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        borderRadius: "0px", 
        display: "flex",
        flexDirection: "column" as const,
        width: '400px',
        maxHeight: '80vh',
        overflow: 'hidden',
        color: theme.text
    },

    // Loading
    overlay: {
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.bg === '#ffffff' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000
    },
    progressBox: {
        width: '320px',
        backgroundColor: theme.panelBg,
        padding: '20px',
        borderRadius: '0px', 
        border: `1px solid ${theme.accent}`,
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        color: theme.text
    },
    progressBarContainer: {
        height: '4px',
        backgroundColor: theme.bg,
        borderRadius: '0px',
        overflow: 'hidden',
        marginTop: '12px'
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.accent,
        transition: 'width 0.2s ease-out'
    },
    
    // Slider
    sliderRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px'
    },
    sliderLabel: {
        fontSize: '11px',
        color: theme.textMuted,
        width: '60px'
    },
    rangeSlider: {
        flex: 1,
        cursor: 'pointer',
        height: '4px',
        outline: 'none',
    },
    
    // Stats HUD (Top Center)
    statsOverlay: {
        position: "absolute" as const,
        top: "8px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: theme.panelBg, 
        color: theme.text, 
        display: "flex",
        flexDirection: "row" as const,
        alignItems: "center",
        gap: "10px", 
        padding: "4px 12px", 
        fontSize: "11px", 
        zIndex: 100,
        pointerEvents: "none" as const,
        borderRadius: "0px", 
        border: `1px solid ${theme.border}`,
        boxShadow: `0 2px 8px ${theme.shadow}`,
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap' as const
    },
    statsDivider: {
        width: "1px",
        height: "10px",
        backgroundColor: theme.border
    }
});

// Deprecated: Default export for backward compatibility, but now we use createStyles
export const colors = themes.dark;
