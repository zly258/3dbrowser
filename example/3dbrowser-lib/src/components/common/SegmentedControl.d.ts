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
export declare const SegmentedControl: React.FC<SegmentedControlProps>;
