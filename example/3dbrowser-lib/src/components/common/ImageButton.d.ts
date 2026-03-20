import React from 'react';
export interface ImageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    label?: string;
    active?: boolean;
    styles?: any;
    theme?: any;
}
export declare const ImageButton: React.FC<ImageButtonProps>;
