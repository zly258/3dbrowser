
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
        bg: "#121212",
        panelBg: "#1E1E1E",
        headerBg: "#2C2C2C",
        border: "#333333",
        text: "#E0E0E0",
        textLight: "#FFFFFF",
        textMuted: "#A0A0A0",
        accent: "#0078D4", 
        highlight: "#2C2C2C",
        itemHover: "rgba(255, 255, 255, 0.08)",
        success: "#81C784",
        warning: "#FFB74D",
        danger: "#E57373",
        canvasBg: "#121212",
        shadow: "rgba(0, 0, 0, 0.5)"
    },
    light: {
        bg: "#F3F2F1", // Office Background
        panelBg: "#FFFFFF",
        headerBg: "#FFFFFF",
        border: "#EDEBE9",
        text: "#323130",
        textLight: "#000000",
        textMuted: "#605E5C",
        accent: "#0078D4", // Office Blue
        highlight: "#F3F2F1",
        itemHover: "#F3F2F1",
        success: "#107C10",
        warning: "#D83B01",
        danger: "#A4262C",
        canvasBg: "#FAF9F8",
        shadow: "rgba(0, 0, 0, 0.1)"
    }
};

export const createGlobalStyle = (theme: ThemeColors, fontFamily: string = "'Segoe UI', 'Microsoft YaHei', sans-serif") => `
    @keyframes fadeInDown {
        from { opacity: 0; transform: translate(-50%, -20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: ${theme.bg}; }
    ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 5px; border: 2px solid ${theme.bg}; transition: background 0.2s; }
    ::-webkit-scrollbar-thumb:hover { background: ${theme.accent}; }
    ::-webkit-scrollbar-corner { background: ${theme.bg}; }
    * { scrollbar-width: thin; scrollbar-color: ${theme.border} ${theme.bg}; }
    body { background-color: ${theme.bg}; color: ${theme.text}; margin: 0; padding: 0; overflow: hidden; font-family: ${fontFamily}; }
    * { box-sizing: border-box; }
    /* Ribbon styles */
    .ribbon-button-large { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 64px; height: 72px; padding: 4px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 12px; gap: 4px; color: ${theme.text}; }
    .ribbon-button-large:hover { background-color: ${theme.itemHover}; border-color: ${theme.border}; }
    .ribbon-button-small { display: flex; align-items: center; width: 100%; height: 24px; padding: 2px 8px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 12px; gap: 8px; color: ${theme.text}; }
    .ribbon-button-small:hover { background-color: ${theme.itemHover}; border-color: ${theme.border}; }
`;

export const createStyles = (theme: ThemeColors, fontFamily: string = "'Segoe UI', 'Microsoft YaHei', sans-serif") => ({
    // Desktop / Shared
    container: { display: "flex", flexDirection: "column" as const, height: "100vh", width: "100vw", backgroundColor: theme.bg, color: theme.text, fontSize: "12px", fontFamily, userSelect: "none" as const, overflow: "hidden" },
    
    // Ribbon UI Styles
    ribbonContainer: {
        display: "flex",
        flexDirection: "column" as const,
        backgroundColor: theme.headerBg,
        borderBottom: `1px solid ${theme.border}`,
        WebkitAppRegion: "drag" as any,
        zIndex: 1000,
        fontFamily,
    },
    ribbonTitleBar: {
        height: "26px", 
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        fontSize: "12px", 
        color: theme.textMuted,
    },
    ribbonTabs: {
        display: "flex",
        padding: "0 4px", 
        gap: "0px", 
        WebkitAppRegion: "no-drag" as any,
    },
    ribbonTab: (active: boolean) => ({
        padding: "4px 12px", 
        fontSize: "12.5px", 
        cursor: "pointer",
        backgroundColor: active ? theme.panelBg : "transparent",
        color: active ? theme.accent : theme.text,
        border: active ? `1px solid ${theme.border}` : "1px solid transparent",
        borderBottom: active ? `1px solid ${theme.panelBg}` : "1px solid transparent",
        marginBottom: "-1px",
        fontWeight: active ? "600" : "400",
        zIndex: 2,
        transition: "background-color 0.1s",
        ":hover": {
            backgroundColor: active ? theme.panelBg : theme.itemHover
        }
    }),
    ribbonContent: {
        height: "88px", // Reduced from 92px
        backgroundColor: theme.panelBg,
        borderTop: `1px solid ${theme.border}`,
        display: "flex",
        padding: "1px 2px", // Reduced from 2px 4px
        gap: "2px", // Reduced from 4px
        overflowX: "auto" as const,
        WebkitAppRegion: "no-drag" as any,
    },
    ribbonPanel: {
        display: "flex",
        flexDirection: "column" as const,
        borderRight: `1px solid ${theme.border}`,
        padding: "1px 1px", // Reduced from 1px 2px
        minWidth: "30px", 
        height: "100%",
        position: "relative" as const,
        flexShrink: 0
    },
    ribbonPanelContent: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: "1px", // Reduced from 3px
        padding: "1px 0"
    },
    ribbonPanelRows: {
        display: "grid",
        gridTemplateRows: "repeat(2, 1fr)",
        gridAutoFlow: "column",
        gap: "0px", // Reduced from 1px
        height: "100%"
    },
    ribbonPanelLabel: {
        fontSize: "11px", // Increased from 10px
        color: theme.textMuted,
        textAlign: "center" as const,
        padding: "1px 2px 2px 2px", 
        opacity: 0.9, // Increased from 0.8
        whiteSpace: "nowrap" as const,
        minHeight: "14px", 
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis"
    },
    ribbonButtonLarge: (active: boolean, hover: boolean = false) => ({
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        width: "48px", 
        height: "100%",
        gap: "1px", 
        cursor: "pointer",
        borderRadius: "2px",
        backgroundColor: active ? `${theme.accent}15` : (hover ? theme.itemHover : "transparent"),
        border: active ? `1px solid ${theme.accent}40` : (hover ? `1px solid ${theme.accent}20` : "1px solid transparent"),
        boxShadow: hover ? `0 2px 8px ${theme.shadow}` : "none",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    }),
    ribbonButtonMedium: (active: boolean, hover: boolean = false) => ({
        display: "flex",
        alignItems: "center",
        padding: "1px 3px", 
        gap: "3px", 
        cursor: "pointer",
        borderRadius: "2px",
        width: "auto",
        minWidth: "44px", 
        height: "20px", 
        backgroundColor: active ? `${theme.accent}15` : (hover ? theme.itemHover : "transparent"),
        border: active ? `1px solid ${theme.accent}40` : (hover ? `1px solid ${theme.accent}20` : "1px solid transparent"),
        boxShadow: hover ? `0 2px 4px ${theme.shadow}` : "none",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        fontSize: "12px", // Increased from 11px
    }),
    ribbonButtonSmall: (active: boolean, hover: boolean = false) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "22px", 
        height: "20px", 
        cursor: "pointer",
        borderRadius: "2px",
        backgroundColor: active ? `${theme.accent}15` : (hover ? theme.itemHover : "transparent"),
        border: active ? `1px solid ${theme.accent}40` : (hover ? `1px solid ${theme.accent}20` : "1px solid transparent"),
        transform: hover ? "scale(1.05)" : "none",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    }),
    ribbonCheckbox: {
        display: "flex",
        alignItems: "center",
        gap: "3px", 
        padding: "0 4px", 
        fontSize: "12px", // Increased from 11px
        cursor: "pointer",
        height: "20px", 
        ":hover": {
            backgroundColor: theme.itemHover
        }
    },
    
    statusBar: {
        height: "24px",
        backgroundColor: theme.accent,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        fontSize: "12px",
        justifyContent: "space-between"
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
        fontFamily: "monospace",
        opacity: 0.9
    },

    toolbarBtn: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "2px", 
        cursor: "pointer",
        color: theme.textMuted,
        backgroundColor: "transparent",
        transition: "all 0.1s ease",
        border: "none", 
        outline: "none",
        position: "relative" as const,
        WebkitAppRegion: "no-drag" as any, // 按钮不可拖拽
    },
    toolbarBtnHover: {
        backgroundColor: theme.itemHover,
        color: theme.text,
        transform: "translateY(-1px)",
    },
    // Checkbox Style
    checkboxContainer: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        userSelect: "none" as const,
        fontSize: "13px",
        color: theme.text,
        padding: "4px 0",
    },
    checkboxCustom: (checked: boolean, hover: boolean = false) => ({
        width: "16px",
        height: "16px",
        borderRadius: "2px",
        border: `2px solid ${checked ? theme.accent : (hover ? theme.accent : theme.border)}`,
        backgroundColor: checked ? theme.accent : (hover ? `${theme.accent}15` : "transparent"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative" as const,
        boxShadow: checked ? `0 2px 4px ${theme.accent}40` : (hover ? `0 0 4px ${theme.accent}20` : "none"),
        transform: hover ? "scale(1.05)" : "none",
    }),
    checkboxCheckmark: {
        width: "10px",
        height: "10px",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    floatingPanel: {
        position: 'absolute' as const,
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: `0 4px 16px ${theme.shadow}`, 
        borderRadius: "2px", 
        display: "flex",
        flexDirection: "column" as const,
        zIndex: 200,
        minWidth: '220px',
        minHeight: '120px',
        overflow: 'hidden',
        color: theme.text,
        transition: "box-shadow 0.2s",
    },
    floatingHeader: {
        padding: "6px 12px", 
        backgroundColor: theme.bg, 
        borderBottom: `1px solid ${theme.border}`,
        cursor: "move",
        fontWeight: "bold",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none" as const,
        fontSize: "12px",
        color: theme.text,
        letterSpacing: "0.1px"
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
        width: '16px',
        height: '16px',
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
        padding: "4px 0"
    },
    treeNode: {
        display: "flex",
        alignItems: "center",
        height: "30px",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        fontSize: "13px",
        color: theme.text,
        transition: "background-color 0.1s ease",
        paddingRight: "8px"
    },
    treeNodeSelected: {
        backgroundColor: `${theme.accent}15`, 
        color: theme.accent,
        fontWeight: '500',
        borderLeft: `3px solid ${theme.accent}`
    },
    expander: {
        width: "24px",
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
        backgroundColor: theme.bg, 
        padding: "8px 16px", 
        fontWeight: "600" as const,
        fontSize: "12px",
        color: theme.text,
        borderBottom: `1px solid ${theme.border}`,
        borderTop: `1px solid ${theme.border}`,
        marginTop: "-1px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        userSelect: "none" as const,
        transition: "background-color 0.2s"
    },
    propRow: {
        display: "flex",
        padding: "6px 16px",
        borderBottom: `1px solid ${theme.border}`,
        alignItems: "center",
        fontSize: "12px",
        gap: "8px"
    },
    propKey: {
        width: "35%",
        color: theme.textMuted,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const
    },
    propValue: {
        width: "65%",
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
        padding: "8px 16px",
        cursor: "pointer",
        borderRadius: "2px",
        fontSize: "12px",
        fontWeight: "500",
        transition: "all 0.2s",
        outline: "none",
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnActive: {
        backgroundColor: theme.accent,
        color: "white",
        borderColor: theme.accent,
        boxShadow: `0 2px 6px ${theme.shadow}`
    },
    
    // View Grid Button
    viewGridBtn: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '2px',
        padding: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: theme.text,
        fontSize: '11px',
        fontWeight: '500',
        height: '60px',
        gap: '4px'
    },
    
    // Modal Overlay
    modalOverlay: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000
    },
    modalContent: {
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        borderRadius: "2px", 
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
        backgroundColor: 'rgba(255,255,255,0.8)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000
    },
    progressBox: {
        width: '320px',
        backgroundColor: theme.panelBg,
        padding: '24px',
        borderRadius: '2px', 
        border: `1px solid ${theme.border}`,
        boxShadow: '0 12px 32px rgba(0,0,0,0.1)',
        color: theme.text
    },
    progressBarContainer: {
        height: '4px',
        backgroundColor: theme.bg,
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '16px'
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
        gap: '12px',
        marginBottom: '12px'
    },
    sliderLabel: {
        fontSize: '12px',
        color: theme.textMuted,
        width: '70px'
    },
    rangeSlider: {
        flex: 1,
        cursor: 'pointer',
        accentColor: theme.accent,
        height: '6px',
        borderRadius: '3px',
        outline: 'none',
        transition: 'all 0.2s'
    },
    
    // Stats HUD (Top Center)
    statsOverlay: {
        position: "absolute" as const,
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: theme.panelBg, 
        color: theme.text, 
        display: "flex",
        flexDirection: "row" as const,
        alignItems: "center",
        gap: "12px", 
        padding: "6px 16px", 
        fontSize: "12px", 
        zIndex: 100,
        pointerEvents: "none" as const,
        borderRadius: "2px", 
        border: `1px solid ${theme.border}`,
        boxShadow: `0 4px 12px ${theme.shadow}`,
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap' as const
    },
    statsDivider: {
        width: "1px",
        height: "12px",
        backgroundColor: theme.border
    }
});

// Deprecated: Default export for backward compatibility, but now we use createStyles
export const colors = themes.dark;
