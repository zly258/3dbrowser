import React from 'react';
export interface ColorPickerProps {
    value: string;
    onChange: (value: string) => void;
    style?: React.CSSProperties;
}
export declare const ColorPicker: React.FC<ColorPickerProps>;
