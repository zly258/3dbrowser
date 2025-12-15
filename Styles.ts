

export const colors = {
    bg: "#1e1e1e",
    panelBg: "#252526",
    headerBg: "#2d2d30",
    ribbonTabBg: "#2d2d30",
    ribbonActiveBg: "#252526", // Matches panelBg
    border: "#3e3e42",
    text: "#cccccc",
    textLight: "#ffffff",
    accent: "#007acc",
    highlight: "#2a2d2e",
    itemHover: "#3e3e40",
    success: "#4ec9b0",
    warning: "#ce9178",
    danger: "#f14c4c"
};

export const styles = {
    // Desktop / Shared
    container: { display: "flex", flexDirection: "column" as const, height: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: "Segoe UI, sans-serif", fontSize: "12px", userSelect: "none" as const, overflow: "hidden" },
    
    // Ribbon Styles
    ribbonContainer: { display: "flex", flexDirection: "column" as const, backgroundColor: colors.ribbonActiveBg, borderBottom: `1px solid ${colors.border}`, flexShrink: 0 },
    ribbonTabsRow: { display: "flex", backgroundColor: colors.ribbonTabBg, height: "24px", alignItems: "flex-end", paddingLeft: "8px", borderBottom: `1px solid ${colors.border}` },
    ribbonTab: { 
        padding: "3px 12px", 
        cursor: "pointer", 
        borderTopLeftRadius: "4px", 
        borderTopRightRadius: "4px", 
        marginRight: "2px", 
        fontSize: "11px",
        border: "1px solid transparent",
        borderBottom: "none",
        color: "#aaa",
        marginBottom: "-1px",
        zIndex: 1
    },
    ribbonTabActive: { 
        backgroundColor: colors.ribbonActiveBg, 
        color: colors.textLight,
        border: `1px solid ${colors.border}`,
        borderBottom: `1px solid ${colors.ribbonActiveBg}`, // Blend with toolbar
    },
    ribbonToolbar: { height: "60px", display: "flex", alignItems: "center", padding: "2px 10px", gap: "8px", overflowX: "auto" as const },
    // Reduced padding/margin for more compact layout
    ribbonGroup: { display: "flex", alignItems: "center", height: "100%", paddingRight: "4px", borderRight: `1px solid ${colors.border}`, marginRight: "4px", gap: "4px" },
    ribbonGroupLabel: { display: "none" }, // Hide to save space
    
    // Ribbon Buttons
    ribbonBtn: { 
        display: "flex", 
        flexDirection: "column" as const, 
        alignItems: "center", 
        justifyContent: "center", 
        height: "54px", 
        minWidth: "40px", 
        padding: "2px 6px", 
        cursor: "pointer", 
        borderRadius: "3px", 
        border: "1px solid transparent",
        color: colors.text,
        gap: "2px"
    },
    ribbonBtnHover: { backgroundColor: colors.itemHover, borderColor: "#555" },
    ribbonBtnActive: { backgroundColor: "#094771", borderColor: colors.accent, color: "white" },
    ribbonIconBox: { width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" },
    ribbonLabel: { fontSize: "10px", textAlign: "center" as const, lineHeight: "1.1", maxWidth: "80px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
    
    // Small Ribbon Button (Grid/Row layout)
    ribbonBtnSmall: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "50px", // Reduced width
        height: "24px",
        padding: "0 4px",
        cursor: "pointer",
        borderRadius: "2px",
        fontSize: "11px",
        backgroundColor: "#3e3e42",
        border: "1px solid #555",
        color: "#eee",
    },
    ribbonBtnSmallHover: { backgroundColor: "#4f4f4f" },

    // Workspace & Resizable Panels
    workspace: { display: "flex", flex: 1, overflow: "hidden", position: "relative" as const },
    
    // Panel base styles (width controlled by inline style)
    resizablePanel: { backgroundColor: colors.panelBg, display: "flex", flexDirection: "column" as const, flexShrink: 0, position: "relative" as const },
    
    // Resize Handles
    resizeHandleHorizontal: {
        width: "4px",
        cursor: "col-resize",
        backgroundColor: colors.bg,
        zIndex: 10,
        transition: "background-color 0.2s",
        flexShrink: 0
    },
    resizeHandleHover: { backgroundColor: colors.accent },

    viewport: { flex: 1, position: "relative" as const, backgroundColor: "#111", overflow: "hidden" },
    statusBar: { height: "24px", backgroundColor: colors.accent, color: "white", display: "flex", alignItems: "center", padding: "0 12px", justifyContent: "space-between", fontSize: "12px", flexShrink: 0 },
    
    // Components
    panelHeader: { padding: "8px 12px", fontWeight: "600", borderBottom: `1px solid ${colors.border}`, backgroundColor: "#2d2d30", textTransform: "uppercase" as const, fontSize: "11px", letterSpacing: "0.5px", color: "#f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", boxSizing: "border-box" as const },
    
    // Floating Panel
    floatingPanel: {
        position: 'absolute' as const,
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column" as const,
        zIndex: 200,
        minWidth: '200px',
        minHeight: '100px',
        overflow: 'hidden'
    },
    floatingHeader: {
        padding: "6px 8px",
        backgroundColor: colors.headerBg,
        borderBottom: `1px solid ${colors.border}`,
        cursor: "move",
        fontWeight: "600",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none" as const,
        fontSize: "11px"
    },
    floatingContent: {
        padding: "10px",
        overflowY: "auto" as const,
        flex: 1
    },
    resizeHandle: {
        position: 'absolute' as const,
        bottom: 0,
        right: 0,
        width: '16px',
        height: '16px',
        cursor: 'se-resize',
        zIndex: 10
    },

    // Modal Styles
    modalOverlay: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000
    },
    modalContent: {
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        display: 'flex', flexDirection: 'column' as const,
        width: '400px',
        maxHeight: '80vh'
    },
    
    // Controls
    sliderRow: { display: "flex", alignItems: "center", marginBottom: "8px", gap: "8px" },
    sliderLabel: { width: "60px", fontSize: "12px", color: "#aaa" },
    rangeSlider: { flex: 1 },
    btnGroup: { display: 'flex', gap: '8px', marginBottom: '8px' },
    btn: {
        padding: "4px 12px",
        backgroundColor: "#3e3e42",
        border: "1px solid #555",
        color: "white",
        cursor: "pointer",
        borderRadius: "2px",
        fontSize: "12px",
        flex: 1,
        textAlign: "center" as const
    },
    btnActive: {
        backgroundColor: colors.accent,
        borderColor: colors.accent
    },
    
    // Tree View
    treeContainer: { flex: 1, overflowY: "auto" as const, overflowX: "hidden" as const, position: "relative" as const },
    treeNode: { display: "flex", alignItems: "center", cursor: "pointer", paddingRight: "8px", height: "24px", whiteSpace: "nowrap" as const },
    treeNodeHover: { backgroundColor: "#2a2d2e" },
    treeNodeSelected: { backgroundColor: "#37373d", color: "white" },
    expander: { width: "20px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", flexShrink: 0 },
    nodeLabel: { overflow: "hidden", textOverflow: "ellipsis", flex: 1 },

    list: { flex: 1, overflowY: "auto" as const, padding: "5px" },
    propGroupTitle: { padding: "4px 8px", backgroundColor: "#333", color: "#aaa", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase" as const, marginTop: 4 },
    propRow: { display: "flex", padding: "6px 10px", borderBottom: "1px solid #333", alignItems: "center" },
    propKey: { flex: "0 0 90px", color: "#888", fontSize: "11px" },
    propValue: { flex: 1, color: "#eee", wordBreak: "break-all" as const, fontFamily: "Consolas, monospace", fontSize: "11px" },
    
    overlay: { position: "absolute" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    progressBox: { background: colors.panelBg, padding: "24px", borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", width: "320px", border: `1px solid ${colors.border}` },
    progressBarContainer: { width:'100%', height:6, background:'#333', borderRadius:3, overflow:'hidden', marginTop: 10 },
    progressBarFill: { height:'100%', background: colors.success, transition: 'width 0.2s ease' }
};
