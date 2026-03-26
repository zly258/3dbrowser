import React from "react";
interface ExportPanelProps {
    t: any;
    onClose?: () => void;
    onExport: (format: string) => void;
    theme: any;
}
export declare const ExportPanel: React.FC<ExportPanelProps>;
export {};
