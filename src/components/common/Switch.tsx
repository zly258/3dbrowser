import React from 'react';

export interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false, className = '' }) => {
    return (
        <button
            className={`ui-switch ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
            onClick={() => !disabled && onChange(!checked)}
            role="switch"
            aria-checked={checked}
            disabled={disabled}
        >
            <div className="ui-switch-thumb" />
        </button>
    );
};
