import React from 'react';

export interface PanelSectionProps {
    title?: string;
    children?: React.ReactNode;
    theme?: any;
    style?: React.CSSProperties;
}

export const PanelSection: React.FC<PanelSectionProps> = ({ title, children, theme, style }) => (
    <div style={{ marginBottom: 12, ...style }}>
        {title && (
            <div style={{ 
                fontSize: 12, 
                fontWeight: 'bold', 
                color: theme?.textMuted || 'var(--text-muted)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8
            }}>
                {title}
                <div style={{ flex: 1, height: 1, background: theme?.border || 'var(--border-color)', opacity: 0.5 }} />
            </div>
        )}
        {children}
    </div>
);
