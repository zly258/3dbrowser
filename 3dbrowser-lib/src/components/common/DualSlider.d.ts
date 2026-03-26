import React from 'react';
/**
 * DualSliderProps - 双向滑块属性接口
 */
export interface DualSliderProps {
    min: number;
    max: number;
    value: [number, number];
    onChange: (value: [number, number]) => void;
    theme?: any;
    disabled?: boolean;
    style?: React.CSSProperties;
}
/**
 * DualSlider - 双向滑块组件
 * 支持选择一个数值范围的滑块，与单向滑动条样式一致
 */
export declare const DualSlider: React.FC<DualSliderProps>;
