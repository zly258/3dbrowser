import React from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Switch, DualSlider, Checkbox, Slider, Button } from "../common";

interface ClipPanelProps {
  t: any;
  onClose?: () => void;
  sceneMgr?: any;
  clipEnabled: boolean;
  setClipEnabled: any;
  clipValues: any;
  setClipValues: any;
  clipActive: any;
  setClipActive: any;
  clipBounds?: { min: [number, number, number]; max: [number, number, number] } | null;
  clipHelperVisible: boolean;
  setClipHelperVisible: (visible: boolean) => void;
  clipHelperOpacity: number;
  setClipHelperOpacity: (opacity: number) => void;
  theme?: any;
}
const AxisSliderRow: React.FC<{
  axis: "x" | "y" | "z";
  label: string;
  active: boolean;
  value: [number, number];
  range?: [number, number];
  onToggle: (v: boolean) => void;
  onChange: (val: [number, number]) => void;
  disabled?: boolean;
}> = ({ axis, label, active, value, range, onToggle, onChange, disabled = false }) => {
  const formatRangeValue = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
  const actualRange = range
    ? `${formatRangeValue(range[0])} ~ ${formatRangeValue(range[1])}`
    : "";
  return (
    <div
      className={`ui-clip-axis-row${disabled ? " ui-is-disabled" : ""}`}
    >

      <Checkbox
        checked={active}
        onChange={(e) => onToggle(e)}
        className="ui-clip-axis-checkbox"
      />
<span
        className={`ui-clip-axis-label${active ? " is-active" : ""}`}
      >
        {axis.toUpperCase()}
      </span>
<div className="ui-clip-axis-slider">
        <DualSlider
          min={0}
          max={100}
          value={value}
          onChange={onChange}
          disabled={disabled || !active}
        />
      </div>
<span
        className="ui-clip-axis-value"
        title={actualRange || undefined}
      >
        {String(Math.round(value[0])).padStart(2, "0")}-{String(Math.round(value[1])).padStart(2, "0")}%
      </span>
    </div>
  );
};

export const ClipPanel: React.FC<ClipPanelProps> = ({
  t,
  onClose,
  clipEnabled,
  setClipEnabled,
  clipValues,
  setClipValues,
  clipActive,
  setClipActive,
  clipBounds,
  clipHelperVisible,
  setClipHelperVisible,
  clipHelperOpacity,
  setClipHelperOpacity,
}) => {
  const handleReset = () => {
    setClipValues({ x: [0, 100], y: [0, 100], z: [0, 100] });
  };

  const axisRange = (axis: "x" | "y" | "z"): [number, number] | undefined => {
    if (!clipBounds) return undefined;
    const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    return [clipBounds.min[index], clipBounds.max[index]];
  };

  return (
    <FloatingPanel
      title={t("clip_title")}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={410}
      resizable={false}
      storageId="tool_clip"
    >
      <div className="ui-toolpanel-body ui-clip-panel-body">
        <div className="ui-panel-section ui-clip-panel-section">
          <div className="ui-form-row ui-clip-form-row">
            <span className="ui-form-label">{t("clip_enable")}</span>
            <div className="ui-form-value">
              <Switch checked={clipEnabled} onChange={(v) => setClipEnabled(v)} />
            </div>
          </div>

          <div className="ui-form-row ui-clip-form-row">
            <span className="ui-form-label">{t("clip_helper_visible")}</span>
            <div className="ui-form-value">
              <Switch
                checked={clipHelperVisible}
                onChange={(v) => setClipHelperVisible(v)}
                disabled={!clipEnabled}
              />
            </div>
          </div>

          <div className="ui-form-row ui-clip-form-row">
            <span className="ui-form-label">{t("clip_helper_opacity")}</span>
            <div className="ui-form-value ui-form-value-stretch">
              <div className="ui-slider-field ui-clip-opacity-field">
                <Slider
                  min={0.05}
                  max={0.35}
                  step={0.01}
                  value={clipHelperOpacity}
                  onChange={(value) => setClipHelperOpacity(value)}
                  disabled={!clipEnabled || !clipHelperVisible}
                />
                <span className="ui-slider-value">{Math.round(clipHelperOpacity * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`ui-panel-section ui-clip-range-section${clipEnabled ? "" : " ui-is-disabled"}`}
        >
          <AxisSliderRow
            axis="x"
            label={t("clip_x")}
            active={clipActive.x}
            value={clipValues.x}
            range={axisRange("x")}
            onToggle={(v) => setClipActive({ ...clipActive, x: v })}
            onChange={(val) => setClipValues({ ...clipValues, x: val })}
            disabled={!clipEnabled}
          />
          <AxisSliderRow
            axis="y"
            label={t("clip_y")}
            active={clipActive.y}
            value={clipValues.y}
            range={axisRange("y")}
            onToggle={(v) => setClipActive({ ...clipActive, y: v })}
            onChange={(val) => setClipValues({ ...clipValues, y: val })}
            disabled={!clipEnabled}
          />
          <AxisSliderRow
            axis="z"
            label={t("clip_z")}
            active={clipActive.z}
            value={clipValues.z}
            range={axisRange("z")}
            onToggle={(v) => setClipActive({ ...clipActive, z: v })}
            onChange={(val) => setClipValues({ ...clipValues, z: val })}
            disabled={!clipEnabled}
          />
          {clipBounds && (
            <div className="ui-clip-range-hint">
              <span>{t("clip_range_current") || "当前模型范围"}</span>
              <span className="ui-clip-range-hint-value">
                X {clipBounds.min[0].toFixed(2)}~{clipBounds.max[0].toFixed(2)}
                {"  "}Y {clipBounds.min[1].toFixed(2)}~{clipBounds.max[1].toFixed(2)}
                {"  "}Z {clipBounds.min[2].toFixed(2)}~{clipBounds.max[2].toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="ui-panel-footer ui-clip-panel-footer">
          <Button variant="default" onClick={handleReset} disabled={!clipEnabled}>
            {t("clip_reset") || "重置范围"}
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
};
