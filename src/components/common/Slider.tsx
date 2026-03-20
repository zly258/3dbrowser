import React, { useRef, useCallback } from 'react';

/**
 * SliderProps - 滑块组件属性接口
 */
export interface SliderProps {
    min: number;              // 最小值
    max: number;              // 最大值
    step?: number;            // 步进值，默认1
    value: number;            // 当前值
    onChange: (value: number) => void;  // 值变化回调
    theme?: any;              // 主题配置
    disabled?: boolean;        // 是否禁用
    style?: React.CSSProperties;  // 自定义样式
    showValue?: boolean;      // 是否显示数值
}

/**
 * Slider - 基础滑块组件
 * 支持拖拽操作，步进值控制
 */
export const Slider: React.FC<SliderProps> = ({
    min, max, step = 1, value, onChange, theme, disabled = false, style
}) => {
    // 计算当前值对应的百分比
    const percentage = ((value - min) / (max - min)) * 100;
    // 滑块容器引用
    const sliderRef = useRef<HTMLDivElement>(null);

    /**
     * 根据鼠标位置计算新值
     */
    const calcValueFromX = useCallback((clientX: number): number => {
        if (!sliderRef.current) return value;
        const rect = sliderRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newValue = min + percent * (max - min);
        return Math.round(newValue / step) * step;
    }, [min, max, step, value]);

    /**
     * 处理鼠标按下事件 - 支持点击轨道和拖拽手柄
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        const targetValue = calcValueFromX(e.clientX);
        onChange(Math.max(min, Math.min(max, targetValue)));

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newValue = calcValueFromX(moveEvent.clientX);
            onChange(Math.max(min, Math.min(max, newValue)));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [calcValueFromX, onChange, min, max, disabled]);

    return (
        <div
            ref={sliderRef}
            className="ui-slider"
            style={{
                opacity: disabled ? 0.5 : 1,
                width: '100%',
                minWidth: 0,
                height: '24px',
                position: 'relative',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                ...style
            }}
            onMouseDown={handleMouseDown}
        >
            {/* 滑块轨道背景 */}
            <div
                className="ui-slider-track"
                style={{
                    position: 'absolute',
                    width: '100%',
                    height: '6px',
                    backgroundColor: 'var(--border-color)',
                    borderRadius: '3px',
                }}
            />
            {/* 滑块进度填充 */}
            <div
                className="ui-slider-progress"
                style={{
                    position: 'absolute',
                    width: `${percentage}%`,
                    height: '6px',
                    backgroundColor: 'var(--accent)',
                    borderRadius: '3px',
                }}
            />
            {/* 滑块拖拽手柄 */}
            <div
                className="ui-slider-thumb"
                style={{
                    left: `${percentage}%`,
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'var(--bg-primary)',
                    border: `2px solid var(--accent)`,
                    borderRadius: '50%',
                    cursor: disabled ? 'not-allowed' : 'default',
                    position: 'absolute',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
            />
        </div>
    );
};
