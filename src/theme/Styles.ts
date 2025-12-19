export interface ThemeColors {
    bg: string;
    panelBg: string;
    headerBg: string;
    ribbonTabBg: string;
    ribbonActiveBg: string;
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
    canvasBg: string; // 默认画布背景
}

export const themes: Record<'dark' | 'light', ThemeColors> = {
    dark: {
        bg: "#1e1e1e",
        panelBg: "#252526",
        headerBg: "#2d2d30",
        ribbonTabBg: "#2d2d30",
        ribbonActiveBg: "#252526",
        border: "#3e3e42",
        text: "#cccccc",
        textLight: "#ffffff",
        textMuted: "#888888",
        accent: "#007acc",
        highlight: "#2a2d2e",
        itemHover: "#3e3e40",
        success: "#4ec9b0",
        warning: "#ce9178",
        danger: "#f14c4c",
        canvasBg: "#1e1e1e"
    },
    light: {
        bg: "#f3f3f3",
        panelBg: "#ffffff",
        headerBg: "#e0e0e0",
        ribbonTabBg: "#e0e0e0",
        ribbonActiveBg: "#f3f3f3", // 比面板稍暗以区分
        border: "#cccccc",
        text: "#333333",
        textLight: "#000000",
        textMuted: "#666666",
        accent: "#007acc",
        highlight: "#e8e8e8",
        itemHover: "#f0f0f0",
        success: "#2da042",
        warning: "#b8860b",
        danger: "#d9534f",
        canvasBg: "#dcdcdc"
    }
};

// 已弃用：为向后兼容而提供的默认导出，但我们现在使用createStyles
export const colors = themes.dark;

export const createGlobalStyle = (theme: ThemeColors) => `
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: ${theme.bg}; }
    ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${theme.textMuted}; }
    body { background-color: ${theme.bg}; color: ${theme.text}; }
`;

export const createStyles = (theme: ThemeColors) => ({
    // 桌面/共享
    container: { display: "flex", flexDirection: "column" as const, height: "100vh", backgroundColor: theme.bg, color: theme.text, fontFamily: "Segoe UI, sans-serif", fontSize: "12px", userSelect: "none" as const, overflow: "hidden" },
    
    // 功能区样式
    ribbonContainer: { display: "flex", flexDirection: "column" as const, backgroundColor: theme.ribbonActiveBg, borderBottom: `1px solid ${theme.border}`, flexShrink: 0 },
    ribbonTabsRow: { display: "flex", backgroundColor: theme.ribbonTabBg, height: "24px", alignItems: "flex-end", paddingLeft: "8px", borderBottom: `1px solid ${theme.border}` },
    ribbonTab: { 
        padding: "3px 12px", 
        cursor: "pointer", 
        borderTopLeftRadius: "4px", 
        borderTopRightRadius: "4px", 
        marginRight: "2px", 
        fontSize: "11px",
        border: "1px solid transparent",
        borderBottom: "none",
        color: theme.textMuted,
        marginBottom: "-1px",
        zIndex: 1
    },
    ribbonTabActive: { 
        backgroundColor: theme.ribbonActiveBg, 
        color: theme.textLight,
        fontWeight: "bold",
        border: `1px solid ${theme.border}`,
        borderBottom: `1px solid ${theme.ribbonActiveBg}`, // 与工具栏融合
    },
    // 功能区工具栏增加到80px以适应底部标签
    ribbonToolbar: { height: "80px", display: "flex", alignItems: "center", padding: "2px 4px", gap: "2px", overflowX: "auto" as const },
    // 功能区组采用垂直布局以容纳标签
    ribbonGroup: { 
        display: "flex", 
        flexDirection: "column" as const, 
        height: "100%", 
        paddingRight: "4px", 
        borderRight: `1px solid ${theme.border}`, 
        marginRight: "2px", 
        justifyContent: "space-between" 
    },
    ribbonGroupContent: {
        display: "flex",
        flex: 1,
        alignItems: "center",
        gap: "1px"
    },
    ribbonGroupLabel: { 
        display: "block", 
        textAlign: "center" as const, 
        fontSize: "10px", 
        color: theme.textMuted, 
        paddingBottom: "2px",
        width: "100%",
        whiteSpace: "nowrap" as const
    },
    
    // 功能区按钮
    ribbonBtn: { 
        display: "flex", 
        flexDirection: "column" as const, 
        alignItems: "center", 
        justifyContent: "center", 
        height: "54px", 
        minWidth: "42px", 
        padding: "2px 4px", 
        cursor: "pointer", 
        borderRadius: "3px", 
        border: "1px solid transparent",
        color: theme.text,
        gap: "4px"
    },
    ribbonBtnHover: { backgroundColor: theme.itemHover, borderColor: theme.border },
    ribbonBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent, color: "white" },
    ribbonIconBox: { width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" },
    ribbonLabel: { fontSize: "11px", textAlign: "center" as const, lineHeight: "1.1", maxWidth: "80px", overflow: "hidden", whiteSpace: "nowrap" as const, textOverflow: "ellipsis" },
    
    // 小型功能区按钮（网格/行布局）
    ribbonBtnSmall: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "24px", 
        height: "24px",
        padding: "2px",
        cursor: "pointer",
        borderRadius: "2px",
        backgroundColor: "transparent",
        color: theme.textMuted,
        border: "1px solid transparent"
    },
    ribbonBtnSmallHover: { backgroundColor: theme.itemHover, border: `1px solid ${theme.border}` },

    // 工作区和可调整大小的面板
    workspace: { display: "flex", flex: 1, overflow: "hidden", position: "relative" as const },
    
    // 面板基础样式（宽度由内联样式控制）
    resizablePanel: { backgroundColor: theme.panelBg, display: "flex", flexDirection: "column" as const, flexShrink: 0, position: "relative" as const, color: theme.text },
    
    // 调整大小手柄
    resizeHandleHorizontal: {
        width: "4px",
        cursor: "col-resize",
        backgroundColor: theme.bg,
        zIndex: 10,
        transition: "background-color 0.2s",
        flexShrink: 0
    },
    resizeHandleHover: { backgroundColor: theme.accent },
    
    treeContainer: {
        flex: 1,
        overflowY: "auto" as const,
        overflowX: "hidden" as const,
        paddingBottom: "10px"
    },
    treeNode: {
        display: "flex",
        alignItems: "center",
        height: "24px",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        fontSize: "12px",
        color: theme.text,
        transition: "background-color 0.1s"
    },
    treeNodeSelected: {
        backgroundColor: theme.itemHover,
        color: theme.textLight,
        fontWeight: 'bold'
    },
    expander: {
        width: "16px",
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
    
    // 属性列表
    list: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "0",
        userSelect: "text" as const
    },
    propGroupTitle: {
        backgroundColor: theme.headerBg,
        padding: "4px 12px",
        fontWeight: "bold" as const,
        fontSize: "11px",
        color: theme.textLight,
        borderTop: `1px solid ${theme.border}`,
        borderBottom: `1px solid ${theme.border}`,
        marginTop: "0px"
    },
    propRow: {
        display: "flex",
        padding: "4px 12px",
        borderBottom: `1px solid ${theme.border}`,
        alignItems: "center"
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

    // 固定视口以确保其占用可用空间
    viewport: { 
        flex: 1, 
        position: "relative" as const, 
        backgroundColor: "#111", 
        overflow: "hidden",
        minWidth: 0, // 对弹性容器至关重要
        minHeight: 0
    },
    statusBar: { height: "24px", backgroundColor: theme.accent, color: "white", display: "flex", alignItems: "center", padding: "0 12px", justifyContent: "space-between", fontSize: "12px", flexShrink: 0 },
    
    // 组件
    panelHeader: { padding: "8px 12px", fontWeight: "600", borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.headerBg, textTransform: "uppercase" as const, fontSize: "11px", letterSpacing: "0.5px", color: theme.textLight, display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", boxSizing: "border-box" as const },
    
    // 浮动面板
    floatingPanel: {
        position: 'absolute' as const,
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column" as const,
        zIndex: 200,
        minWidth: '200px',
        minHeight: '100px',
        overflow: 'hidden',
        color: theme.text
    },
    floatingHeader: {
        padding: "6px 8px",
        backgroundColor: theme.headerBg,
        borderBottom: `1px solid ${theme.border}`,
        cursor: "move",
        fontWeight: "600",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none" as const,
        fontSize: "11px",
        color: theme.textLight
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

    // 模态框样式
    modalOverlay: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000
    },
    modalContent: {
        backgroundColor: theme.panelBg,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column" as const,
        width: '400px',
        height: '500px',
        overflow: 'hidden',
        color: theme.text
    },

    // UI元素
    btn: {
        backgroundColor: theme.headerBg,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        padding: "6px 12px",
        cursor: "pointer",
        borderRadius: "2px",
        fontSize: "12px",
        transition: "background-color 0.1s",
        outline: "none"
    },
    btnActive: {
        backgroundColor: theme.accent,
        borderColor: theme.accent,
        color: "white"
    },
    
    // 加载
    overlay: {
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(30,30,30,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50
    },
    progressBox: {
        width: '300px',
        backgroundColor: theme.panelBg,
        padding: '20px',
        borderRadius: '4px',
        border: `1px solid ${theme.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        color: theme.text
    },
    progressBarContainer: {
        height: '4px',
        backgroundColor: theme.border,
        borderRadius: '2px',
        overflow: 'hidden'
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.accent,
        transition: 'width 0.2s ease-out'
    },

    // 滑块
    sliderRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '10px'
    },
    sliderLabel: {
        fontSize: '11px',
        color: theme.textMuted,
        width: '60px'
    },
    rangeSlider: {
        flex: 1,
        cursor: 'pointer'
    }
});