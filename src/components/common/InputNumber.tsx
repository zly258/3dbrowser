import React, { useEffect, useState } from "react";
import { clamp, cx } from "./utils";

export interface InputNumberProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
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
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  unit,
  className,
  style,
  disabled,
  ...props
}) => {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (nextText: string) => {
    if (nextText.trim() === "") {
      setText(String(value));
      return;
    }

    const parsed = Number(nextText);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }

    const nextValue = clamp(parsed, min, max);
    setText(String(nextValue));
    if (nextValue !== value) onChange(nextValue);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = event.target.value;
    setText(nextText);

    if (nextText.trim() === "") return;

    const parsed = Number(nextText);
    if (!Number.isFinite(parsed)) return;

    const nextValue = clamp(parsed, min, max);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <div className={cx("ui-input-number", "ui-input-number-root", disabled && "disabled", className)} style={style}>
      <input
        type="number"
        value={text}
        onChange={handleChange}
        onBlur={() => commit(text)}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        disabled={disabled}
        className={cx("ui-input", "ui-input-number-input", unit && "ui-input-number-input-with-unit")}
        {...props}
      />
      {unit && <span className="ui-input-number-unit">{unit}</span>}
    </div>
  );
};
