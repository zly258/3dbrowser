import React from 'react';

export interface SegmentedControlOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

export interface SegmentedControlProps {
    options: SegmentedControlOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ 
    options, value, onChange, className = '' 
}) => (
    <div className={`ui-segmented ${className}`}>
        {options.map((option) => (
            <button
                key={option.value}
                className={`ui-segmented-item ${value === option.value ? 'active' : ''}`}
                onClick={() => onChange(option.value)}
            >
                {option.icon && <span>{option.icon}</span>}
                <span>{option.label}</span>
            </button>
        ))}
    </div>
);
