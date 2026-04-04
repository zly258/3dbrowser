import React from 'react';

export interface ColorPickerProps {
    value: string;
    onChange: (value: string) => void;
    style?: React.CSSProperties;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, style }) => (
    <div className="ui-color-picker" style={style}>
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="ui-color-picker-input"
        />
        <span className="ui-color-picker-value">
            {value}
        </span>
    </div>
);
