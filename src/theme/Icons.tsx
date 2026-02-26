import React from "react";

const iconSize = 18;
const iconStrokeWidth = 1.5;

const createIcon = (paths: React.ReactNode, props: any = {}) => {
  const { size, color, ...rest } = props;
  return (
    <svg
      width={size || iconSize}
      height={size || iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={iconStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {paths}
    </svg>
  );
};

export const IconChevronRight = (props: any) => createIcon(<polyline points="9 18 15 12 9 6" />, props);
export const IconChevronDown = (props: any) => createIcon(<polyline points="6 9 12 15 18 9" />, props);
export const IconChevronUp = (props: any) => createIcon(<polyline points="18 15 12 9 6 15" />, props);
export const IconClear = (props: any) => createIcon(
  <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </>,
  props
);
export const IconClose = (props: any) => createIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>,
  props
);
