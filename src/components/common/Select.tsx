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
        className={`ui-input ${className}`}
        style={{
            padding: '4px 28px 4px 8px',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23A0A0A0' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            ...style
        }}
    >
        {options.map((option) => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </select>
);
