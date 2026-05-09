import React, { useCallback, useMemo, useRef } from "react";
import { clamp, cx, getValueFromClientX, valueToPercent } from "./utils";

export interface DualSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  theme?: any;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

type ActiveThumb = "start" | "end";

export const DualSlider: React.FC<DualSliderProps> = ({
  min,
  max,
  value,
  onChange,
  theme,
  disabled = false,
  style,
  className
}) => {
  void theme;

  const sliderRef = useRef<HTMLDivElement>(null);

  const safeValue = useMemo<[number, number]>(() => {
    const start = clamp(Math.min(value[0], value[1]), min, max);
    const end = clamp(Math.max(value[0], value[1]), min, max);
    return [start, end];
  }, [value, min, max]);

  const startPercent = valueToPercent(safeValue[0], min, max);
  const endPercent = valueToPercent(safeValue[1], min, max);

  const updateThumb = useCallback((thumb: ActiveThumb, clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const nextValue = getValueFromClientX(clientX, rect, min, max, 1);

    if (thumb === "start") {
      onChange([clamp(nextValue, min, safeValue[1] - 1), safeValue[1]]);
    } else {
      onChange([safeValue[0], clamp(nextValue, safeValue[0] + 1, max)]);
    }
  }, [min, max, safeValue, onChange]);

  const startDrag = useCallback((thumb: ActiveThumb, event: React.MouseEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    updateThumb(thumb, event.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => updateThumb(thumb, moveEvent.clientX);
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [disabled, updateThumb]);

  const handleTrackClick = useCallback((event: React.MouseEvent) => {
    if (disabled || !sliderRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = sliderRef.current.getBoundingClientRect();
    const clickValue = getValueFromClientX(event.clientX, rect, min, max, 1);
    const startDistance = Math.abs(clickValue - safeValue[0]);
    const endDistance = Math.abs(clickValue - safeValue[1]);

    updateThumb(startDistance <= endDistance ? "start" : "end", event.clientX);
  }, [disabled, min, max, safeValue, updateThumb]);

  return (
    <div
      ref={sliderRef}
      className={cx("ui-slider", "ui-dual-slider", disabled ? "ui-slider-control-disabled" : "ui-slider-control-interactive", className)}
      style={style}
      onClick={handleTrackClick}
      role="group"
      aria-disabled={disabled}
    >
      <div className="ui-slider-track" />
      <div className="ui-slider-progress" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} />
      <div
        className="ui-slider-thumb ui-dual-slider-thumb ui-dual-slider-thumb-start"
        style={{ left: `${startPercent}%`, cursor: disabled ? "not-allowed" : "default" }}
        onMouseDown={(event) => startDrag("start", event)}
      />
      <div
        className="ui-slider-thumb ui-dual-slider-thumb ui-dual-slider-thumb-end"
        style={{ left: `${endPercent}%`, cursor: disabled ? "not-allowed" : "default" }}
        onMouseDown={(event) => startDrag("end", event)}
      />
    </div>
  );
};
