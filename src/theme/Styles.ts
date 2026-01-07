
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
        accent: "#64B5F6", 
        highlight: "#2C2C2C",
        itemHover: "rgba(255, 255, 255, 0.08)",
        success: "#81C784",
        warning: "#FFB74D",
        danger: "#E57373",
        canvasBg: "#121212",
        shadow: "rgba(0, 0, 0, 0.5)"
    },
    light: {
        bg: "#F0F2F5",
        panelBg: "#FFFFFF",
        headerBg: "#FFFFFF",
        border: "#E0E0E0",
        text: "#333333",
        textLight: "#000000",
        textMuted: "#757575",
        accent: "#1976D2",
        highlight: "#F5F5F5",
        itemHover: "rgba(0, 0, 0, 0.04)",
        success: "#388E3C",
        warning: "#F57C00",
        danger: "#D32F2F",
        canvasBg: "#E8E8E8",
        shadow: "rgba(0, 0, 0, 0.12)"
    }
};

export const createGlobalStyle = (theme: ThemeColors) => `
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${theme.textMuted}; }
    body { background-color: ${theme.bg}; color: ${theme.text}; margin: 0; padding: 0; overflow: hidden; font-family: 'Roboto', 'Segoe UI', sans-serif; }
    * { box-sizing: border-box; }
    
    /* Remove default checkbox border/appearance and use accent color */
    input[type="checkbox"] {
        accent-color: ${theme.accent};
        cursor: pointer;
        outline: none;
        border: 1px solid ${theme.border};
        border-radius: 4px;
        width: 14px;
        height: 14px;
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    input[type="checkbox"]:checked {
        background-color: ${theme.accent};
        border-color: ${theme.accent};
    }
    input[type="checkbox"]:checked::after {
        content: '';
        width: 4px;
        height: 8px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg) translate(-1px, -1px);
    }
    input[type="checkbox"]:focus {
        outline: none;
        box-shadow: none;
    }
    /* Enforce pointer cursor on range inputs */
    input[type="range"] {
        cursor: pointer;
    }
`;

export const createStyles = (theme: ThemeColors) => ({
    // Desktop / Shared
    container: { display: "flex", flexDirection: "column" as const, height: "100vh", width: "100vw", backgroundColor: theme.bg, color: theme.text, fontSize: "13px", userSelect: "none" as const, overflow: "hidden" },
    
    // Viewport
    viewport: { 
        position: "absolute" as const, 
        top: 0, left: 0, right: 0, bottom: 0, 
        backgroundColor: theme.canvasBg, 
        overflow: "hidden",
        zIndex: 0
    },

    // Bottom Toolbar - Compact Material Design
    toolbarContainer: {
        position: "absolute" as const,
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        backgroundColor: theme.panelBg,
        padding: "4px 6px", 
        borderRadius: "6px", 
        boxShadow: `0 4px 20px ${theme.shadow}`,
        gap: "2px",
        zIndex: 1000,
        border: `1px solid ${theme.border}`,
    },
    
    toolbarDivider: {
        width: "1px",
        height: "18px",
        backgroundColor: theme.border,
        margin: "0 2px"
    },

    toolbarBtn: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "36px",
        height: "36px",
        borderRadius: "4px", 
        cursor: "pointer",
        color: theme.textMuted,
        backgroundColor: "transparent",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        border: "none", 
        outline: "none",
        position: "relative" as const
    },
    toolbarBtnHover: {
        backgroundColor: theme.itemHover,
        color: theme.text,
        transform: "translateY(-1px)",
    },
    toolbarBtnActive: {
        backgroundColor: `${theme.accent}15`, 
        color: theme.accent,
    },
    
    // Floating Panels
    floatingPanel: {
        position: 'absolute' as const,
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: `0 8px 30px ${theme.shadow}`,
        borderRadius: "6px",
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
        padding: "10px 14px",
        backgroundColor: theme.panelBg, 
        borderBottom: `1px solid ${theme.border}`,
        cursor: "move",
        fontWeight: "600",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none" as const,
        fontSize: "13px",
        color: theme.text,
        letterSpacing: "0.2px"
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
        borderRadius: "4px",
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
        borderRadius: '4px',
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
        borderRadius: "6px", 
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
        borderRadius: '6px', 
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
        cursor: 'pointer', // Ensure simple slider has pointer
        accentColor: theme.accent
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
        borderRadius: "6px", 
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
