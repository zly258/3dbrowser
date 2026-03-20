import React, { useRef, useCallback } from 'react';

/**
 * SettingSliderProps - 设置滑块属性接口
 */
export interface SettingSliderProps {
    min: number;              // 最小值
    max: number;              // 最大值
    step: number;             // 步进值
    value: number;            // 当前值
    onChange: (value: number) => void;  // 值变化回调
    showValue?: boolean;      // 是否显示数值
    style?: React.CSSProperties;  // 自定义样式
}

/**
 * SettingSlider - 设置面板用滑块组件
 * 带数值显示的滑块，用于各种设置项
 */
export const SettingSlider: React.FC<SettingSliderProps> = ({
    min, max, step, value, onChange, showValue = true, style
}) => {
    // 计算滑块当前值对应的百分比
    const percentage = ((value - min) / (max - min)) * 100;
    // 滑块容器引用
    const sliderRef = useRef<HTMLDivElement>(null);

    /**
     * 根据鼠标位置计算新值
     */
    const calcValueFromX = useCallback((clientX: number): number => {
        if (!sliderRef.current) return value;
        const rect = sliderRef.current.getBoundingClientRect();
        const deltaX = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, deltaX / rect.width));
        const newValue = min + percent * (max - min);
        // 按步进取整
        return Math.round(newValue / step) * step;
    }, [min, max, step, value]);

    /**
     * 处理鼠标按下事件 - 支持点击轨道和拖拽手柄
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
    }, [calcValueFromX, onChange, min, max]);

    /**
     * 处理鼠标移动事件（hover效果）
     */
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!sliderRef.current) return;
        const rect = sliderRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        // 可以添加hover效果
    }, []);

    return (
        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, width: '100%', ...style }}>
            {/* 滑块主体 */}
            <div
                ref={sliderRef}
                className="ui-slider"
                style={{
                    flex: 1,
                    minWidth: 0,
                    height: '24px',
                    position: 'relative',
                    width: '100%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
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
                        transition: 'width 0.05s',
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
                        cursor: 'default',
                        position: 'absolute',
                        transform: 'translateX(-50%)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                />
            </div>
            {/* 数值显示 */}
            {showValue && (
                <span
                    style={{
                        fontFamily: "'Consolas', 'Monaco', monospace",
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        minWidth: '40px',
                        textAlign: 'right',
                        flexShrink: 0,
                    }}
                >
                    {step < 1 ? value.toFixed(1) : value}
                </span>
            )}
        </div>
    );
};
