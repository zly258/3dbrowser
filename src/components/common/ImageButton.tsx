import React from 'react';

export interface ImageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    label?: string;
    active?: boolean;
    styles?: any;
    theme?: any;
}

export const ImageButton: React.FC<ImageButtonProps> = ({ 
    icon, 
    label, 
    active, 
    styles, 
    theme, 
    style, 
    className = '',
    ...props 
}) => {
    const [hover, setHover] = React.useState(false);
    
    const baseStyle = {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        height: '40px',
        minWidth: '48px',
        gap: '2px',
        fontSize: '12px',
        color: theme?.text || '#333',
        cursor: 'pointer',
        backgroundColor: active 
            ? (styles?.toolbarBtnActive?.backgroundColor || theme?.accent || '#007acc')
            : (hover ? (theme?.itemHover || '#f0f0f0') : 'transparent'),
        border: 'none',
        borderRadius: '4px',
        transition: 'background-color 0.1s',
        outline: 'none',
        overflow: 'hidden',
        boxSizing: 'border-box' as const,
        ...style
    };

    const iconStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        overflow: 'hidden',
    };

    const labelStyle = {
        fontSize: '10px',
        lineHeight: '1',
        color: active ? (theme?.textLight || '#fff') : (theme?.text || '#333'),
        whiteSpace: 'nowrap' as const,
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
    };

    return (
        <button 
            style={baseStyle} 
            className={`ui-toolbar-btn ${active ? 'active' : ''} ${className}`}
            {...props}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <div style={iconStyle}>{icon}</div>
            {label && <div style={labelStyle}>{label}</div>}
        </button>
    );
};
