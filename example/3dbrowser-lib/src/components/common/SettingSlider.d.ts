import React from 'react';
/**
 * SettingSliderProps - 设置滑块属性接口
 */
export interface SettingSliderProps {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
    showValue?: boolean;
    style?: React.CSSProperties;
}
/**
 * SettingSlider - 设置面板用滑块组件
 * 带数值显示的滑块，用于各种设置项
 */
export declare const SettingSlider: React.FC<SettingSliderProps>;
