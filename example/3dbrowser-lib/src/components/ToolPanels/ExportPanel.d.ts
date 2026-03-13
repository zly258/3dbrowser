import React from "react";
interface ExportPanelProps {
    t: any;
    onClose?: () => void;
    onExport: (format: string) => void;
    styles: any;
    theme: any;
}
export declare const ExportPanel: React.FC<ExportPanelProps>;
export {};
