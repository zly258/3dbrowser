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
    ...props 
}) => {
    return (
        <button 
            style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }} 
            className={`ui-toolbar-btn ${active ? 'active' : ''} ${className}`}
            disabled={disabled}
            {...props}
        >
            <div className="ui-toolbar-btn-icon">
                {icon}
            </div>
            {label && (
                <div className="ui-toolbar-btn-label">
                    {label}
                </div>
            )}
        </button>
    );
};

