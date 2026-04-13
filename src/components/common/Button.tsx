import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'default';
    size?: 'sm' | 'md' | 'lg';
    active?: boolean;
    theme?: any;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'default', 
    size = 'md',
    active, 
    theme, 
    style, 
    className = '',
    ...props 
}) => {
    let btnClass = 'ui-btn';
    if (variant === 'primary') btnClass += ' ui-btn-primary';
    else if (variant === 'danger') btnClass += ' ui-btn-danger';
    else if (variant === 'ghost') btnClass += ' ui-btn-ghost';
    else btnClass += ' ui-btn-default';
    
    if (size === 'sm') btnClass += ' ui-btn-sm';
    else if (size === 'lg') btnClass += ' ui-btn-lg';
    else btnClass += ' ui-btn-md';

    if (active) btnClass += ' active';

    return (
        <button className={`${btnClass} ${className}`} style={style} {...props}>
            {children}
        </button>
    );
};
