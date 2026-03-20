import React from 'react';

export interface ColorPickerProps {
    value: string;
    onChange: (value: string) => void;
    style?: React.CSSProperties;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, style }) => (
    <div className="flex items-center gap-2" style={style}>
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
                width: '28px',
                height: '28px',
                padding: 0,
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
            }}
        />
        <span
            style={{
                fontFamily: "'Consolas', 'Monaco', monospace",
                fontSize: '11px',
                color: 'var(--text-secondary)',
            }}
        >
            {value}
        </span>
    </div>
);
