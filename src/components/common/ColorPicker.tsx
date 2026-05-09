import React from "react";
import { BaseComponentProps } from "./types";
import { cx } from "./utils";

export interface ColorPickerProps extends BaseComponentProps {
  value: string;
  onChange: (value: string) => void;
  showValue?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  showValue = true,
  className = "",
  style
}) => {
  return (
    <div className={cx("ui-color-picker", className)} style={style}>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="ui-color-picker-input"
      />
      {showValue && (
        <span className="ui-color-picker-value">
          {value}
        </span>
      )}
    </div>
  );
};
