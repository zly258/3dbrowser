import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'default';
    active?: boolean;
    theme?: any;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'default', 
    active, 
    theme, 
    style, 
    className = '',
    ...props 
}) => {
    let btnClass = 'ui-btn';
    if (variant === 'primary') btnClass += ' ui-btn-primary';
    else if (variant === 'danger') btnClass += ' bg-error text-white border-error';
    else if (variant === 'ghost') btnClass += ' ui-btn-ghost';
    else btnClass += ' ui-btn-default';
    
    if (active) btnClass += ' active';

    return (
        <button className={`${btnClass} ${className}`} style={style} {...props}>
            {children}
        </button>
    );
};
