import React from 'react';
export interface PanelSectionProps {
    title?: string;
    children?: React.ReactNode;
    theme?: any;
    style?: React.CSSProperties;
}
export declare const PanelSection: React.FC<PanelSectionProps>;
