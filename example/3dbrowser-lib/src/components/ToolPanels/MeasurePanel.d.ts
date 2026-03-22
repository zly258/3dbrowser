import React from "react";
interface MeasurePanelProps {
    t: any;
    sceneMgr: any;
    measureType: any;
    setMeasureType: any;
    measureHistory: any[];
    onDelete: (id: string) => void;
    onClear: () => void;
    onClose?: () => void;
    theme?: any;
    highlightedId?: string;
    onHighlight?: (id: string) => void;
}
export declare const MeasurePanel: React.FC<MeasurePanelProps>;
export {};
