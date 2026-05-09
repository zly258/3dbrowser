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
        <div className="ui-loading-overlay">
            <div className="ui-loading-box">
                <div className="ui-loading-header">
                    <div className="ui-loading-title">{status}</div>
                    <div className="ui-loading-percent">{percentText}</div>
                </div>

                <div className="ui-progress-bar ui-loading-progress">
                    <div
                        className="ui-progress-fill"
                        style={{ width: percentText }}
                    />
                </div>

                <div className="ui-loading-meta">
                    <svg className="ui-loading-spinner" viewBox="0 0 24 24">
                        <circle
                            className="ui-loading-spinner-track"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                        />
                        <path
                            className="ui-loading-spinner-head"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <span>
                        {safeProgress >= 100 ? t("processing") : t("loading_resources")}
                    </span>
                </div>
            </div>
        </div>
    );
};
