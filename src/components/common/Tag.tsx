import React from "react";
import { cx } from "./utils";

export interface TagProps {
  children: React.ReactNode;
  color?: "default" | "primary" | "success" | "warning" | "error";
  closable?: boolean;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Tag: React.FC<TagProps> = ({
  children,
  color = "default",
  closable = false,
  onClose,
  className,
  style
}) => {
  return (
    <span className={cx("ui-tag", color !== "default" && `ui-tag-${color}`, className)} style={style}>
      {children}
      {closable && (
        <button
          type="button"
          className="ui-tag-close"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          aria-label="Close"
        >
          <svg viewBox="64 64 896 896" width="10" height="10" fill="currentColor">
            <path d="M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 00203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z" />
          </svg>
        </button>
      )}
    </span>
  );
};
