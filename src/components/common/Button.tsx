import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    active?: boolean;
    styles?: any;
    theme?: any;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    active, 
    styles, 
    theme, 
    style, 
    className = '',
    ...props 
}) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'primary':
                return active ? styles?.btnActive : styles?.btn;
            case 'danger':
                return { ...styles?.btn, backgroundColor: theme?.danger, borderColor: theme?.danger, color: 'white' };
            case 'ghost':
                return { ...styles?.btn, backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' };
            default:
                return styles?.btn;
        }
    };

    const baseStyle = {
        ...getVariantStyles(),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        transition: 'all 0.2s',
        border: variant === 'ghost' ? 'none' : (active ? `1px solid ${theme?.accent}` : `1px solid ${theme?.border}`),
        boxShadow: variant === 'ghost' ? 'none' : 'none',
        opacity: props.disabled ? 0.4 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        pointerEvents: props.disabled ? 'none' : 'auto' as any,
        ...style
    };

    return (
        <button style={baseStyle} className={`ui-btn ${className}`} {...props}>
            {children}
        </button>
    );
};
