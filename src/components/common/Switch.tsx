import React from "react";
import { cx } from "./utils";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({
  checked,
  onChange,
  disabled = false,
  className,
  type = "button",
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("ui-switch", checked && "active", disabled && "disabled", className)}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      {...props}
    >
      <span className="ui-switch-thumb" />
    </button>
  );
});

Switch.displayName = "Switch";
