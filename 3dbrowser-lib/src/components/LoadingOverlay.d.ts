import React from "react";
interface LoadingOverlayProps {
    t: (key: string) => string;
    loading: boolean;
    status: string;
    progress: number;
    theme: any;
}
export declare const LoadingOverlay: React.FC<LoadingOverlayProps>;
export {};
