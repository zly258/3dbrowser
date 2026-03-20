import React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    active?: boolean;
    styles?: any;
    theme?: any;
}
export declare const Button: React.FC<ButtonProps>;
