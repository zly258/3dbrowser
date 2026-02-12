import React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    active?: boolean;
    styles: any;
    theme: any;
}
export declare const Button: React.FC<ButtonProps>;
export declare const PanelSection: ({ title, children, theme, style }: any) => import("react/jsx-runtime").JSX.Element;
export declare const Slider: ({ min, max, step, value, onChange, theme, disabled, style }: any) => import("react/jsx-runtime").JSX.Element;
export declare const DualSlider: ({ min, max, value, onChange, theme, disabled, style }: any) => import("react/jsx-runtime").JSX.Element;
