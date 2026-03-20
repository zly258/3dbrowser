import React, { useRef, useCallback } from 'react';

/**
 * DualSliderProps - 双向滑块属性接口
 */
export interface DualSliderProps {
    min: number;              // 最小值
    max: number;              // 最大值
    value: [number, number];  // 当前范围 [最小值, 最大值]
    onChange: (value: [number, number]) => void;  // 值变化回调
    theme?: any;              // 主题配置
    disabled?: boolean;       // 是否禁用
    style?: React.CSSProperties;  // 自定义样式
}

/**
 * DualSlider - 双向滑块组件
 * 支持选择一个数值范围的滑块，与单向滑动条样式一致
 */
export const DualSlider: React.FC<DualSliderProps> = ({
    min, max, value, onChange, theme, disabled = false, style
}) => {
    // 滑块容器引用
    const sliderRef = useRef<HTMLDivElement>(null);
    // 计算两个手柄的百分比位置
    const percentage1 = ((value[0] - min) / (max - min)) * 100;
    const percentage2 = ((value[1] - min) / (max - min)) * 100;

    /**
     * 根据鼠标位置计算对应的值
     */
    const calcValueFromX = useCallback((clientX: number): number => {
        if (!sliderRef.current) return min;
        const rect = sliderRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return min + percent * (max - min);
    }, [min, max]);

    /**
     * 处理第一个手柄拖拽
     */
    const handleThumb1MouseDown = useCallback((e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newValue = calcValueFromX(moveEvent.clientX);
            // 确保第一个值不超过第二个值-1
            onChange([Math.max(min, Math.min(value[1] - 1, Math.round(newValue))), value[1]]);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [disabled, calcValueFromX, onChange, min, value]);

    /**
     * 处理第二个手柄拖拽
     */
    const handleThumb2MouseDown = useCallback((e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newValue = calcValueFromX(moveEvent.clientX);
            // 确保第二个值不小于第一个值+1
            onChange([value[0], Math.min(max, Math.max(value[0] + 1, Math.round(newValue)))]);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [disabled, calcValueFromX, onChange, max, value]);

    /**
     * 处理轨道点击 - 移动最近的手柄
     */
    const handleTrackClick = useCallback((e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();

        const clickValue = calcValueFromX(e.clientX);
        // 判断点击位置离哪个手柄更近
        const dist1 = Math.abs(clickValue - value[0]);
        const dist2 = Math.abs(clickValue - value[1]);

        if (dist1 <= dist2) {
            onChange([Math.max(min, Math.min(value[1] - 1, Math.round(clickValue))), value[1]]);
        } else {
            onChange([value[0], Math.min(max, Math.max(value[0] + 1, Math.round(clickValue)))]);
        }
    }, [disabled, calcValueFromX, onChange, min, max, value]);

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
            onClick={handleTrackClick}
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
            {/* 选中范围进度条 */}
            <div
                className="ui-slider-progress"
                style={{
                    position: 'absolute',
                    left: `${percentage1}%`,
                    width: `${percentage2 - percentage1}%`,
                    height: '6px',
                    backgroundColor: 'var(--accent)',
                    borderRadius: '3px',
                }}
            />
            {/* 第一个手柄 */}
            <div
                className="ui-slider-thumb"
                style={{
                    left: `${percentage1}%`,
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
                onMouseDown={handleThumb1MouseDown}
            />
            {/* 第二个手柄 */}
            <div
                className="ui-slider-thumb"
                style={{
                    left: `${percentage2}%`,
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
                onMouseDown={handleThumb2MouseDown}
            />
        </div>
    );
};
