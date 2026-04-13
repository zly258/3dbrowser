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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, overflow: "visible" }}>
                {icon}
            </div>
            {label && (
                <div
                    style={{
                        fontSize: 11,
                        lineHeight: 1,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%"
                    }}
                >
                    {label}
                </div>
            )}
        </button>
    );
};

