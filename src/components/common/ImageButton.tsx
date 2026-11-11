import React from 'react';

export interface ImageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    label?: string;
    active?: boolean;
        theme?: any;
}

export const ImageButton: React.FC<ImageButtonProps> = ({
    icon,
    label,
    active,
    theme,
    style,
    className = '',
    disabled,
    title,
    ...props
}) => {
    void theme;

    return (
        <button
            type="button"
            style={style}
            className={`ui-toolbar-btn ${active ? 'active' : ''} ${className}`}
            disabled={disabled}
            aria-pressed={active}
            title={title ?? label}
            aria-label={label}
            {...props}
        >
            <span className="ui-toolbar-btn-icon" aria-hidden="true">
                {icon}
            </span>
            {label && (
                <span className="ui-toolbar-btn-label">
                    {label}
                </span>
            )}
        </button>
    );
};