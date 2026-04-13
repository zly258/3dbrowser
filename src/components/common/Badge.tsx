import React from 'react';

export interface BadgeProps {
    count?: number | React.ReactNode;
    overflowCount?: number;
    dot?: boolean;
    showZero?: boolean;
    status?: 'success' | 'error' | 'default' | 'processing' | 'warning';
    text?: React.ReactNode;
    offset?: [number, number];
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
    count = 0,
    overflowCount = 99,
    dot = false,
    showZero = false,
    status,
    text,
    offset,
    className = '',
    style,
    children
}) => {
    // Status badge mode
    if (status || text) {
        return (
            <span className={`ui-badge-status ${className}`} style={style}>
                <span className={`ui-badge-status-dot ui-badge-status-${status || 'default'}`} />
                {text && <span className="ui-badge-status-text">{text}</span>}
            </span>
        );
    }

    // Number or dot mode
    const isZero = count === 0 || count === '0';
    const isHidden = !showZero && isZero;
    let displayCount = count;
    
    if (typeof count === 'number' && count > overflowCount) {
        displayCount = `${overflowCount}+`;
    }

    const badgeStyle: React.CSSProperties = { ...style };
    if (offset) {
        badgeStyle.right = -offset[0];
        badgeStyle.marginTop = offset[1];
    }

    return (
        <span className="ui-badge-wrapper">
            {children}
            {!isHidden && (
                dot ? (
                    <span className={`ui-badge-dot ${className}`} style={badgeStyle} />
                ) : (
                    <sup className={`ui-badge ${className}`} style={badgeStyle}>
                        {displayCount}
                    </sup>
                )
            )}
        </span>
    );
};
