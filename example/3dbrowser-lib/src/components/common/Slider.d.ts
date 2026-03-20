import React from 'react';
/**
 * SliderProps - 滑块组件属性接口
 */
export interface SliderProps {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (value: number) => void;
    theme?: any;
    disabled?: boolean;
    style?: React.CSSProperties;
    showValue?: boolean;
}
/**
 * Slider - 基础滑块组件
 * 支持拖拽操作，步进值控制
 */
export declare const Slider: React.FC<SliderProps>;
