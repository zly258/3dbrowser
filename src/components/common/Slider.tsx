import React, { useCallback, useRef } from "react";
import { cx, getValueFromClientX, normalizeNumber, valueToPercent } from "./utils";

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
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  theme,
  disabled = false,
  style,
  className
}) => {
  void theme;

  const sliderRef = useRef<HTMLDivElement>(null);
  const safeValue = normalizeNumber(value, min, max, step);
  const percentage = valueToPercent(safeValue, min, max);

  const updateValueByClientX = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    onChange(getValueFromClientX(clientX, rect, min, max, step));
  }, [min, max, step, onChange]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (disabled) return;
    event.preventDefault();
    updateValueByClientX(event.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => updateValueByClientX(moveEvent.clientX);
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [disabled, updateValueByClientX]);

  return (
    <div
      ref={sliderRef}
      className={cx("ui-slider", "ui-slider-control", disabled ? "ui-slider-control-disabled" : "ui-slider-control-interactive", className)}
      style={style}
      onMouseDown={handleMouseDown}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="ui-slider-track" />
      <div className="ui-slider-progress" style={{ width: `${percentage}%` }} />
      <div className="ui-slider-thumb" style={{ left: `${percentage}%`, cursor: disabled ? "not-allowed" : "default" }} />
    </div>
  );
};
