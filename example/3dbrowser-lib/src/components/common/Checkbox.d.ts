import React from 'react';
export interface CheckboxProps {
    label?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    style?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}
export declare const Checkbox: React.FC<CheckboxProps>;
