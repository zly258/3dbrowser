import React from 'react';

export interface CheckboxProps {
    label?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    style?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}

export const Checkbox: React.FC<CheckboxProps> = ({ 
    label, checked, onChange, disabled = false, style, labelStyle 
}) => {
    return (
        <label
            className={`ui-checkbox ${disabled ? 'ui-checkbox-disabled' : ''}`}
            style={style}
            onClick={(e) => {
                if (disabled) return;
                e.preventDefault();
                onChange(!checked);
            }}
        >
            <div
                className={`ui-checkbox-box ${checked ? 'ui-checkbox-box-checked' : ''}`}
            >
                {checked && (
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ui-checkbox-icon"
                    >
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                )}
            </div>
            {label && (
                <span className="ui-checkbox-label" style={labelStyle}>
                    {label}
                </span>
            )}
        </label>
    );
};
