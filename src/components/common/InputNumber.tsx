import React, { useEffect, useState } from 'react';

export interface InputNumberProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}

export const InputNumber: React.FC<InputNumberProps> = ({
    value,
    onChange,
    min,
    max,
    step = 1,
    unit,
    className = '',
    style,
    ...props
}) => {
    const [text, setText] = useState(() => String(value));

    useEffect(() => {
        setText(String(value));
    }, [value]);

    const clampValue = (nextValue: number) => {
        let val = nextValue;
        if (min !== undefined) val = Math.max(min, val);
        if (max !== undefined) val = Math.min(max, val);
        return val;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextText = e.target.value;
        setText(nextText);
        if (nextText.trim() === '') return;

        const parsed = parseFloat(nextText);
        if (isNaN(parsed)) return;
        onChange(clampValue(parsed));
    };

    const handleBlur = () => {
        if (text.trim() === '') {
            setText(String(value));
            return;
        }
        const parsed = parseFloat(text);
        if (isNaN(parsed)) {
            setText(String(value));
            return;
        }
        const clamped = clampValue(parsed);
        setText(String(clamped));
        if (clamped !== value) {
            onChange(clamped);
        }
    };

    const stepUp = () => {
        const nextValue = clampValue(value + step);
        setText(String(nextValue));
        onChange(nextValue);
    };

    const stepDown = () => {
        const nextValue = clampValue(value - step);
        setText(String(nextValue));
        onChange(nextValue);
    };

    return (
        <div 
            className={`ui-input-number ui-input-number-root ${className}`} 
            style={style}
        >
            <input
                type="number"
                value={text}
                onChange={handleChange}
                onBlur={handleBlur}
                min={min}
                max={max}
                step={step}
                className={`ui-input ui-input-number-input ${unit ? 'ui-input-number-input-with-unit' : 'ui-input-number-input-with-controls'}`}
                {...props}
            />
            {unit && (
                <span className="ui-input-number-unit">
                    {unit}
                </span>
            )}
            <div className="ui-input-number-controls">
                <button 
                    onClick={stepUp}
                    className="ui-input-number-btn"
                    title="Increase"
                    style={{ flex: 1 }}
                >
                    ▲
                </button>
                <button 
                    onClick={stepDown}
                    className="ui-input-number-btn"
                    title="Decrease"
                    style={{ flex: 1 }}
                >
                    ▼
                </button>
            </div>
        </div>
    );
};
