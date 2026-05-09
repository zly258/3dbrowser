import React from "react";
import { ComponentSize, ComponentVariant } from "./types";
import { cx } from "./utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ComponentVariant;
  size?: ComponentSize;
  active?: boolean;
  theme?: any;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = "default",
  size = "md",
  active = false,
  theme,
  className,
  type = "button",
  ...props
}, ref) => {
  void theme;

  const variantClass = variant === "primary"
    ? "ui-btn-primary"
    : variant === "danger"
      ? "ui-btn-danger"
      : variant === "ghost"
        ? "ui-btn-ghost"
        : "ui-btn-default";

  const sizeClass = size === "sm"
    ? "ui-btn-sm"
    : size === "lg"
      ? "ui-btn-lg"
      : "ui-btn-md";

  return (
    <button
      ref={ref}
      type={type}
      className={cx("ui-btn", variantClass, sizeClass, active && "active", className)}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = "Button";
