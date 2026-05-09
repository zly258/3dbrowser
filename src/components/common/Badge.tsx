import React from "react";
import { ComponentStatus } from "./types";
import { cx } from "./utils";

export interface BadgeProps {
  count?: number | React.ReactNode;
  overflowCount?: number;
  dot?: boolean;
  showZero?: boolean;
  status?: ComponentStatus;
  text?: React.ReactNode;
  offset?: [number, number];
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  count = 0,
  overflowCount = 99,
  dot = false,
  showZero = false,
  status,
  text,
  offset,
  className,
  style,
  children
}) => {
  if (status || text) {
    return (
      <span className={cx("ui-badge-status", className)} style={style}>
        <span className={cx("ui-badge-status-dot", `ui-badge-status-${status || "default"}`)} />
        {text && <span className="ui-badge-status-text">{text}</span>}
      </span>
    );
  }

  const isZero = count === 0 || count === "0";
  const hidden = !showZero && isZero;
  const displayCount = typeof count === "number" && count > overflowCount ? `${overflowCount}+` : count;
  const badgeStyle: React.CSSProperties = { ...style };

  if (offset) {
    badgeStyle.right = -offset[0];
    badgeStyle.marginTop = offset[1];
  }

  return (
    <span className="ui-badge-wrapper">
      {children}
      {!hidden && (
        dot
          ? <span className={cx("ui-badge-dot", className)} style={badgeStyle} />
          : <sup className={cx("ui-badge", className)} style={badgeStyle}>{displayCount}</sup>
      )}
    </span>
  );
};
