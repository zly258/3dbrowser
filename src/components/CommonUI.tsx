import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    active?: boolean;
    styles: any;
    theme: any;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    active, 
    styles, 
    theme, 
    style, 
    ...props 
}) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'primary':
                return active ? styles.btnActive : styles.btn;
            case 'danger':
                return { ...styles.btn, backgroundColor: theme.danger, borderColor: theme.danger, color: 'white' };
            case 'ghost':
                return { ...styles.btn, backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' };
            default:
                return styles.btn;
        }
    };

    const baseStyle = {
        ...getVariantStyles(),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        transition: 'all 0.2s',
        border: variant === 'ghost' ? 'none' : (active ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`),
        boxShadow: variant === 'ghost' ? 'none' : 'none', // 不使用默认的黑色描边/阴影
        ...style
    };

    return (
        <button style={baseStyle} {...props}>
            {children}
        </button>
    );
};

export const PanelSection = ({ title, children, theme, style }: any) => (
    <div style={{ marginBottom: 16, ...style }}>
        {title && (
            <div style={{ 
                fontSize: 11, 
                fontWeight: 'bold', 
                color: theme.textMuted, 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8
            }}>
                {title}
                <div style={{ flex: 1, height: 1, background: theme.border, opacity: 0.5 }} />
            </div>
        )}
        {children}
    </div>
);

// --- 统一滑块样式 ---
const SLIDER_TRACK_HEIGHT = 4;
const SLIDER_THUMB_SIZE = 14;

export const Slider = ({ min, max, step = 1, value, onChange, theme, disabled, style }: any) => {
    return (
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            width: '100%', 
            height: 32,
            padding: '0 4px',
            opacity: disabled ? 0.5 : 1,
            ...style 
        }}>
            <input 
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{
                    flex: 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    height: SLIDER_TRACK_HEIGHT,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: theme.border,
                    borderRadius: SLIDER_TRACK_HEIGHT / 2,
                    outline: 'none',
                }}
            />
            <style dangerouslySetInnerHTML={{ __html: `
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    height: ${SLIDER_THUMB_SIZE}px;
                    width: ${SLIDER_THUMB_SIZE}px;
                    border-radius: 50%;
                    background: #fff;
                    cursor: pointer;
                    border: 2px solid ${theme.accent};
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    margin-top: 0;
                }
                input[type=range]::-moz-range-thumb {
                    height: ${SLIDER_THUMB_SIZE}px;
                    width: ${SLIDER_THUMB_SIZE}px;
                    border-radius: 50%;
                    background: #fff;
                    cursor: pointer;
                    border: 2px solid ${theme.accent};
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
            `}} />
        </div>
    );
};

export const DualSlider = ({ min, max, value, onChange, theme, disabled, style }: any) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const getPercentage = (val: number) => ((val - min) / (max - min)) * 100;

    const handleMouseDown = (index: 0 | 1) => (e: React.MouseEvent) => {
        if(disabled || e.button !== 0) return;
        e.preventDefault();
        
        const startX = e.clientX;
        const startVal = value[index];
        const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;

        const onMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const dx = moveEvent.clientX - startX;
            const diff = (dx / trackWidth) * (max - min);
            let newVal = startVal + diff;
            newVal = Math.max(min, Math.min(max, newVal));

            const nextValue: [number, number] = [value[0], value[1]];
            if (index === 0) {
                nextValue[0] = Math.min(newVal, value[1]);
            } else {
                nextValue[1] = Math.max(newVal, value[0]);
            }
            onChange(nextValue);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    return (
        <div ref={trackRef} style={{
            position: 'relative', width: '100%', height: 32, display: 'flex', alignItems: 'center', 
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            padding: '0 4px',
            ...style
        }}>
            <div style={{
                position: 'absolute', left: 4, right: 4, height: SLIDER_TRACK_HEIGHT, 
                background: theme.border, borderRadius: SLIDER_TRACK_HEIGHT / 2
            }} />
            <div style={{
                position: 'absolute',
                left: `calc(4px + ${getPercentage(value[0])}%)`,
                width: `calc(${getPercentage(value[1]) - getPercentage(value[0])}%)`,
                height: SLIDER_TRACK_HEIGHT,
                background: theme.accent,
                borderRadius: SLIDER_TRACK_HEIGHT / 2,
            }} />
            <div 
                onMouseDown={handleMouseDown(0)}
                style={{
                    position: 'absolute', 
                    left: `calc(4px + ${getPercentage(value[0])}% - ${SLIDER_THUMB_SIZE / 2}px)`,
                    width: SLIDER_THUMB_SIZE, 
                    height: SLIDER_THUMB_SIZE, 
                    background: 'white', 
                    borderRadius: '50%', 
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    boxShadow: `0 1px 3px rgba(0,0,0,0.2)`, 
                    zIndex: 2, 
                    border: `2px solid ${theme.accent}`,
                }}
            />
            <div 
                onMouseDown={handleMouseDown(1)}
                style={{
                    position: 'absolute', 
                    left: `calc(4px + ${getPercentage(value[1])}% - ${SLIDER_THUMB_SIZE / 2}px)`,
                    width: SLIDER_THUMB_SIZE, 
                    height: SLIDER_THUMB_SIZE, 
                    background: 'white', 
                    borderRadius: '50%', 
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    boxShadow: `0 1px 3px rgba(0,0,0,0.2)`, 
                    zIndex: 2, 
                    border: `2px solid ${theme.accent}`,
                }}
            />
        </div>
    );
};
