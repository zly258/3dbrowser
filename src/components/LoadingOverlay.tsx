

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
                <div style={{marginBottom: 10, color: theme.text}}>{status}</div>
                <div style={styles.progressBarContainer}>
                    <div style={{...styles.progressBarFill, width: `${progress}%`}}></div>
                </div>
                <div style={{marginTop: 5, textAlign:'right', fontSize:11, color: theme.textMuted}}>{Math.round(progress)}%</div>
            </div>
        </div>
    );
};
