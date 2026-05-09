import React from "react";

export type ComponentSize = "sm" | "md" | "lg";
export type ComponentStatus = "success" | "error" | "default" | "processing" | "warning";
export type ComponentVariant = "primary" | "secondary" | "danger" | "ghost" | "default";

export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export interface ValueOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}
