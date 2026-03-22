import React from "react";
interface ViewpointPanelProps {
    t: any;
    onClose?: () => void;
    viewpoints: any[];
    onSave: (name: string) => void;
    onUpdateName: (id: string, name: string) => void;
    onLoad: (viewpoint: any) => void;
    onDelete: (id: string) => void;
    theme: any;
}
export declare const ViewpointPanel: React.FC<ViewpointPanelProps>;
export {};
