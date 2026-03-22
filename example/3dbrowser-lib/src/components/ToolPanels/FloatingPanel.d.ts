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
    theme?: any;
    storageId?: string;
    modal?: boolean;
}
export declare const FloatingPanel: React.FC<FloatingPanelProps>;
export {};
