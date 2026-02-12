import React from "react";
interface FloatingPanelProps {
    title: string;
    onClose?: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    resizable?: boolean;
    movable?: boolean;
    styles: any;
    theme: any;
    storageId?: string;
}
export declare const FloatingPanel: React.FC<FloatingPanelProps>;
export declare const Checkbox: ({ label, checked, onChange, styles, style }: any) => import("react/jsx-runtime").JSX.Element;
export declare const MeasurePanel: ({ t, sceneMgr, measureType, setMeasureType, measureHistory, onDelete, onClear, onClose, styles, theme, highlightedId, onHighlight }: any) => import("react/jsx-runtime").JSX.Element;
export declare const ClipPanel: ({ t, onClose, clipEnabled, setClipEnabled, clipValues, setClipValues, clipActive, setClipActive, styles, theme }: any) => import("react/jsx-runtime").JSX.Element;
export declare const ExportPanel: ({ t, onClose, onExport, styles, theme }: any) => import("react/jsx-runtime").JSX.Element;
export declare const ViewpointPanel: ({ t, onClose, viewpoints, onSave, onUpdateName, onLoad, onDelete, styles, theme }: any) => import("react/jsx-runtime").JSX.Element;
export {};
