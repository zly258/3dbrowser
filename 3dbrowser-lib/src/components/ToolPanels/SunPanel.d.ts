import React from "react";
interface SunPanelProps {
    t: any;
    onClose?: () => void;
    settings: {
        sunEnabled?: boolean;
        sunLatitude?: number;
        sunLongitude?: number;
        sunTime?: number;
        sunShadow?: boolean;
    };
    onUpdate: (settings: any) => void;
    theme: any;
}
export declare const SunPanel: React.FC<SunPanelProps>;
export {};
