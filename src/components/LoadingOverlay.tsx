import React from "react";

interface LoadingOverlayProps {
    t: (key: string) => string;
    loading: boolean;
    status: string;
    progress: number;
    theme: any;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    t,
    loading,
    status,
    progress,
    theme
}) => {
    void theme;

    if (!loading) return null;

    const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
    const percentText = `${Math.round(safeProgress)}%`;

    return (
        <div className="ui-loading-overlay" role="status" aria-live="polite" aria-label={status}>
            <div className="cad-loading-card">
                <div className="cad-loading-head">
                    <span className="cad-spinner cad-spinner-sm" aria-hidden="true" />
                    <span className="cad-loading-title" title={status}>{status}</span>
                    <span className="cad-loading-pct">{percentText}</span>
                </div>

                <div className="cad-loading-track">
                    <i style={{ width: percentText }} />
                </div>

                <div className="cad-loading-note">
                    {safeProgress >= 100 ? t("processing") : t("loading_resources")}
                </div>
            </div>
        </div>
    );
};