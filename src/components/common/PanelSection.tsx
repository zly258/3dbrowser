import React from 'react';

export interface PanelSectionProps {
    title?: string;
    children?: React.ReactNode;
    theme?: any;
    style?: React.CSSProperties;
}

export const PanelSection: React.FC<PanelSectionProps> = ({ title, children, theme, style }) => (
    <section className="ui-section-block" style={style}>
        {title && (
            <div className="ui-section-header">
                <span
                    className="ui-section-title"
                    style={{ color: theme?.textMuted || "var(--text-muted)" }}
                >
                    {title}
                </span>
                <div
                    className="ui-section-divider"
                    style={{ background: theme?.border || "var(--border-color)" }}
                />
            </div>
        )}
        {children}
    </section>
);
