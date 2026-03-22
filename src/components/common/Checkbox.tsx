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
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
                opacity: disabled ? 0.5 : 1,
                ...style
            }}
            onClick={(e) => {
                if (disabled) return;
                e.preventDefault();
                onChange(!checked);
            }}
        >
            <div
                style={{
                    width: '14px',
                    height: '14px',
                    minWidth: '14px',
                    minHeight: '14px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '2px',
                    backgroundColor: checked ? 'var(--accent)' : 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'none',
                    flexShrink: 0,
                }}
            >
                {checked && (
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: '10px', height: '10px' }}
                    >
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                )}
            </div>
            {label && (
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', ...labelStyle }}>
                    {label}
                </span>
            )}
        </label>
    );
};
