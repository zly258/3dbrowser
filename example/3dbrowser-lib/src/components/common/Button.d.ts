import React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'default';
    active?: boolean;
    theme?: any;
}
export declare const Button: React.FC<ButtonProps>;
