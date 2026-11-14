import React from "react";
import { BaseComponentProps } from "./types";
import { cx } from "./utils";

export interface CheckboxProps extends BaseComponentProps {
  label?: React.ReactNode;
  /** 无可见文字时提供给读屏的标签 */
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelStyle?: React.CSSProperties;
  name?: string;
  value?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  ariaLabel,
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
    <label
      className={cx("ui-checkbox", checked && "ui-checkbox-checked", disabled && "ui-checkbox-disabled", className)}
      style={style}
      title={typeof label === "string" ? label : undefined}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="ui-checkbox-native"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      />
      <span className={cx("ui-checkbox-box", checked && "ui-checkbox-box-checked")} aria-hidden="true">
        {checked && (
          <svg viewBox="0 0 24 24" className="ui-checkbox-icon">
            <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
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