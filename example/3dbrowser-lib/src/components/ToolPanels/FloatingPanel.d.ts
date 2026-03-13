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
export {};
