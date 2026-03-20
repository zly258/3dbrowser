import React from 'react';
export interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}
export declare const Switch: React.FC<SwitchProps>;
