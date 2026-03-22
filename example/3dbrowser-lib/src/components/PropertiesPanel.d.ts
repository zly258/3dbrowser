import React from "react";
interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, Record<string, string>> | null;
    theme: any;
}
export declare const PropertiesPanel: React.FC<PropertiesPanelProps>;
export {};
