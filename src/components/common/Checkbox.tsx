import React from "react";
import { BaseComponentProps } from "./types";
import { cx } from "./utils";

export interface CheckboxProps extends BaseComponentProps {
  label?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelStyle?: React.CSSProperties;
  name?: string;
  value?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  className,
  style,
  labelStyle,
  name,
  value
}) => {
  const handleChange = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <label className={cx("ui-checkbox", disabled && "ui-checkbox-disabled", className)} style={style}>
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="ui-checkbox-native"
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <span className={cx("ui-checkbox-box", checked && "ui-checkbox-box-checked")} aria-hidden="true">
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ui-checkbox-icon">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      {label && (
        <span className="ui-checkbox-label" style={labelStyle}>
          {label}
        </span>
      )}
    </label>
  );
};
