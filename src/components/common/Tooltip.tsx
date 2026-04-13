import React, { useState } from 'react';

export interface TooltipProps {
    children: React.ReactNode;
    title: React.ReactNode;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
    style?: React.CSSProperties;
}

export const Tooltip: React.FC<TooltipProps> = ({
    children,
    title,
    placement = 'top',
    className = '',
    style,
}) => {
    return (
        <span className={`ui-tooltip-wrapper ${className}`} style={style}>
            {children}
            {title && (
                <div className={`ui-tooltip ui-tooltip-${placement}`}>
                    {title}
                </div>
            )}
        </span>
    );
};
