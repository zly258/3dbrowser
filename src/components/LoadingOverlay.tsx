import React from "react";

interface LoadingOverlayProps {
    loading: boolean;
    status: string;
    progress: number;
    styles: any;
    theme: any;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loading, status, progress, styles, theme }) => {
    if (!loading) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.progressBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>{status}</div>
                    <div style={{ color: theme.accent, fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(progress)}%</div>
                </div>
                
                <div style={styles.progressBarContainer}>
                    <div 
                        style={{
                            ...styles.progressBarFill, 
                            width: `${progress}%`,
                            transition: 'width 0.3s ease-out',
                            boxShadow: `0 0 10px ${theme.accent}40`
                        }}
                    ></div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12px', color: theme.textMuted }}>
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
                    <span>{progress === 100 ? "Processing..." : "Loading resources..."}</span>
                </div>
            </div>
        </div>
    );
};
