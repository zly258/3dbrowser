import React from "react";
import { cx } from "./utils";

export interface TooltipProps {
  children: React.ReactNode;
  title: React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  title,
  placement = "top",
  className,
  style
}) => {
  return (
    <span className={cx("ui-tooltip-wrapper", className)} style={style}>
      {children}
      {title && <span className={cx("ui-tooltip", `ui-tooltip-${placement}`)}>{title}</span>}
    </span>
  );
};
