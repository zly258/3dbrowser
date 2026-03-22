import React from "react";

interface LoadingOverlayProps {
    t: (key: string) => string;
    loading: boolean;
    status: string;
    progress: number;
        theme: any;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ t, loading, status, progress, theme }) => {
    if (!loading) return null;

    return (
        <div className="ui-loading-overlay">
            <div className="ui-loading-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{status}</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(progress)}%</div>
                </div>
                
                <div className="ui-progress-bar" style={{ marginTop: '12px' }}>
                    <div 
                        className="ui-progress-fill"
                        style={{
                            width: `${progress}%`,
                            transition: 'width 0.3s ease-out',
                        }}
                    />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <svg style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <style>{`
                        @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                    <span>{progress === 100 ? t("processing") : t("loading_resources")}</span>
                </div>
            </div>
        </div>
    );
};
