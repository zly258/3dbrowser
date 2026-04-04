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

export const Select: React.FC<SelectProps> = ({ value, options, onChange, className = '', style }) => (
    <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`ui-input ui-select ${className}`}
        style={style}
    >
        {options.map((option) => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </select>
);
