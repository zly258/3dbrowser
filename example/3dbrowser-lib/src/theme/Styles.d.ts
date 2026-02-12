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
export declare const themes: Record<'dark' | 'light', ThemeColors>;
export declare const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";
export declare const createGlobalStyle: (theme: ThemeColors) => string;
export declare const createStyles: (theme: ThemeColors) => {
    container: {
        display: string;
        flexDirection: "column";
        height: string;
        width: string;
        backgroundColor: string;
        color: string;
        fontSize: string;
        fontFamily: string;
        userSelect: "none";
        overflow: string;
    };
    classicMenuBar: {
        display: string;
        alignItems: string;
        backgroundColor: string;
        borderBottom: string;
        padding: string;
        height: string;
        gap: string;
        WebkitAppRegion: any;
    };
    classicMenuItem: (active: boolean, hover: boolean) => {
        padding: string;
        height: string;
        display: string;
        alignItems: string;
        fontSize: string;
        color: string;
        cursor: string;
        backgroundColor: string;
        transition: string;
    };
    classicMenuDropdown: {
        position: "absolute";
        top: string;
        left: number;
        backgroundColor: string;
        border: string;
        boxShadow: string;
        zIndex: number;
        minWidth: string;
        padding: string;
    };
    classicMenuSubItem: (hover: boolean) => {
        padding: string;
        fontSize: string;
        color: string;
        cursor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        backgroundColor: string;
    };
    statusBar: {
        height: string;
        backgroundColor: string;
        color: string;
        display: string;
        alignItems: string;
        padding: string;
        fontSize: string;
        justifyContent: string;
        borderTop: string;
    };
    statusBarRight: {
        display: string;
        alignItems: string;
        gap: string;
    };
    statusMonitorItem: {
        display: string;
        alignItems: string;
        gap: string;
        fontFamily: string;
        opacity: number;
    };
    toolbarBtn: {
        display: string;
        alignItems: string;
        justifyContent: string;
        width: string;
        height: string;
        borderRadius: string;
        cursor: string;
        color: string;
        backgroundColor: string;
        transition: string;
        border: string;
        outline: string;
        position: "relative";
        WebkitAppRegion: any;
    };
    toolbarBtnHover: {
        backgroundColor: string;
        color: string;
    };
    checkboxContainer: {
        display: string;
        alignItems: string;
        gap: string;
        cursor: string;
        userSelect: "none";
        fontSize: string;
        color: string;
        padding: string;
    };
    checkboxCustom: (checked: boolean) => {
        width: string;
        height: string;
        borderRadius: string;
        border: string;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        transition: string;
        position: "relative";
        cursor: string;
    };
    checkboxCheckmark: {
        width: string;
        height: string;
        color: string;
        display: string;
        alignItems: string;
        justifyContent: string;
    };
    floatingPanel: {
        position: "absolute";
        backgroundColor: string;
        border: string;
        boxShadow: string;
        borderRadius: string;
        display: string;
        flexDirection: "column";
        zIndex: number;
        minWidth: string;
        minHeight: string;
        overflow: string;
        color: string;
    };
    floatingHeader: {
        height: string;
        padding: string;
        backgroundColor: string;
        borderBottom: string;
        cursor: string;
        fontWeight: string;
        display: string;
        justifyContent: string;
        alignItems: string;
        userSelect: "none";
        fontSize: string;
        color: string;
    };
    floatingContent: {
        padding: string;
        overflowY: "auto";
        flex: number;
        position: "relative";
        display: string;
        flexDirection: "column";
    };
    resizeHandle: {
        position: "absolute";
        bottom: number;
        right: number;
        width: string;
        height: string;
        cursor: string;
        zIndex: number;
        background: string;
    };
    treeContainer: {
        flex: number;
        height: string;
        overflowY: "auto";
        overflowX: "hidden";
        padding: string;
    };
    treeNode: (selected: boolean, hover: boolean) => {
        display: string;
        alignItems: string;
        height: string;
        cursor: string;
        whiteSpace: "nowrap";
        fontSize: string;
        color: string;
        backgroundColor: string;
        transition: string;
        paddingRight: string;
        fontWeight: string;
    };
    expander: {
        width: string;
        height: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        cursor: string;
        color: string;
    };
    nodeLabel: {
        flex: number;
        overflow: string;
        textOverflow: string;
    };
    list: {
        flex: number;
        overflowY: "auto";
        padding: string;
        userSelect: "text";
    };
    propGroupTitle: {
        backgroundColor: string;
        padding: string;
        fontWeight: "600";
        fontSize: string;
        color: string;
        borderBottom: string;
        borderTop: string;
        marginTop: string;
        cursor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        userSelect: "none";
    };
    propRow: {
        display: string;
        padding: string;
        borderBottom: string;
        alignItems: string;
        fontSize: string;
        gap: string;
    };
    propKey: {
        width: string;
        color: string;
        overflow: string;
        textOverflow: string;
        whiteSpace: "nowrap";
    };
    propValue: {
        width: string;
        color: string;
        whiteSpace: "nowrap";
        overflow: string;
        textOverflow: string;
        cursor: string;
    };
    btn: {
        backgroundColor: string;
        color: string;
        border: string;
        padding: string;
        cursor: string;
        borderRadius: string;
        fontSize: string;
        fontWeight: string;
        transition: string;
        outline: string;
        display: string;
        alignItems: string;
        justifyContent: string;
    };
    btnActive: {
        backgroundColor: string;
        color: string;
        borderColor: string;
    };
    viewGridBtn: {
        display: string;
        flexDirection: "column";
        alignItems: string;
        justifyContent: string;
        backgroundColor: string;
        border: string;
        borderRadius: string;
        padding: string;
        cursor: string;
        transition: string;
        color: string;
        fontSize: string;
        height: string;
        gap: string;
    };
    modalOverlay: {
        position: "fixed";
        top: number;
        left: number;
        right: number;
        bottom: number;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        zIndex: number;
    };
    modalContent: {
        backgroundColor: string;
        border: string;
        boxShadow: string;
        borderRadius: string;
        display: string;
        flexDirection: "column";
        width: string;
        maxHeight: string;
        overflow: string;
        color: string;
    };
    overlay: {
        position: "absolute";
        top: number;
        left: number;
        right: number;
        bottom: number;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        zIndex: number;
    };
    progressBox: {
        width: string;
        backgroundColor: string;
        padding: string;
        borderRadius: string;
        border: string;
        boxShadow: string;
        color: string;
    };
    progressBarContainer: {
        height: string;
        backgroundColor: string;
        borderRadius: string;
        overflow: string;
        marginTop: string;
    };
    progressBarFill: {
        height: string;
        backgroundColor: string;
        transition: string;
    };
    sliderRow: {
        display: string;
        alignItems: string;
        gap: string;
        marginBottom: string;
    };
    sliderLabel: {
        fontSize: string;
        color: string;
        width: string;
    };
    rangeSlider: {
        flex: number;
        cursor: string;
        height: string;
        outline: string;
    };
    statsOverlay: {
        position: "absolute";
        top: string;
        left: string;
        transform: string;
        backgroundColor: string;
        color: string;
        display: string;
        flexDirection: "row";
        alignItems: string;
        gap: string;
        padding: string;
        fontSize: string;
        zIndex: number;
        pointerEvents: "none";
        borderRadius: string;
        border: string;
        boxShadow: string;
    };
    statsRow: {
        display: string;
        alignItems: string;
        gap: string;
        whiteSpace: "nowrap";
    };
    statsDivider: {
        width: string;
        height: string;
        backgroundColor: string;
    };
};
export declare const colors: ThemeColors;
