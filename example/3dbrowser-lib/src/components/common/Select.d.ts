import React from 'react';
export interface SelectOption {
    value: string;
    label: string;
}
export interface SelectProps {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    className?: string;
    style?: React.CSSProperties;
}
export declare const Select: React.FC<SelectProps>;
