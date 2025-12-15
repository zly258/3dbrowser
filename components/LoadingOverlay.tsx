
import React from "react";
import { styles, colors } from "../Styles";

interface LoadingOverlayProps {
    loading: boolean;
    status: string;
    progress: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loading, status, progress }) => {
    if (!loading) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.progressBox}>
                <div style={{marginBottom: 10, color: 'white'}}>{status}</div>
                <div style={styles.progressBarContainer}>
                    <div style={{...styles.progressBarFill, width: `${progress}%`}}></div>
                </div>
                <div style={{marginTop: 5, textAlign:'right', fontSize:11}}>{Math.round(progress)}%</div>
            </div>
        </div>
    );
};
