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
  clipHelperVisible: boolean;
  setClipHelperVisible: (visible: boolean) => void;
  clipHelperOpacity: number;
  setClipHelperOpacity: (opacity: number) => void;
  theme?: any;
}

// Axis Slider Row
const AxisSliderRow: React.FC<{
  axis: "x" | "y" | "z";
  label: string;
  active: boolean;
  value: [number, number];
  onToggle: (v: boolean) => void;
  onChange: (val: [number, number]) => void;
  disabled?: boolean;
}> = ({ axis, label, active, value, onToggle, onChange, disabled = false }) => {
  return (
    <div
      className="flex items-center"
      style={{
        gap: "8px",
        padding: "6px 0",
        borderBottom: "1px solid var(--border-color)",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >

      <Checkbox
        checked={active}
        onChange={(e) => onToggle(e)}
        style={{
          width: "16px",
          height: "16px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      />

      {/* Axis label */}
      <span
        style={{
          fontSize: "12px",
          fontWeight: "600",
          minWidth: "16px",
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
          flexShrink: 0,
        }}
      >
        {axis.toUpperCase()}
      </span>

      {/* Dual Slider */}
      <div style={{ flex: 1 }}>
        <DualSlider
          min={0}
          max={100}
          value={value}
          onChange={onChange}
          disabled={disabled || !active}
        />
      </div>

      {/* Value display */}
      <span
        style={{
          fontSize: "11px",
          color: "var(--text-primary)",
          minWidth: "66px",
          textAlign: "right",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
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
  clipHelperVisible,
  setClipHelperVisible,
  clipHelperOpacity,
  setClipHelperOpacity,
}) => {
  const handleReset = () => {
    setClipValues({ x: [0, 100], y: [0, 100], z: [0, 100] });
  };

  return (
    <FloatingPanel
      title={t("clip_title")}
      onClose={onClose}
      width={320}
      height={420}
      resizable={false}
      storageId="tool_clip"
    >
      <div
        className="ui-panel-stack"
        style={{ height: "100%" }}
      >
        <div className="ui-panel-section">
          <div className="ui-form-row">
            <span className="ui-form-label">{t("clip_enable")}</span>
            <div className="ui-form-value">
              <Switch checked={clipEnabled} onChange={(v) => setClipEnabled(v)} />
            </div>
          </div>

          <div className="ui-form-row">
            <span className="ui-form-label">{t("clip_helper_visible")}</span>
            <div className="ui-form-value">
              <Switch
                checked={clipHelperVisible}
                onChange={(v) => setClipHelperVisible(v)}
                disabled={!clipEnabled}
              />
            </div>
          </div>

          <div className="ui-form-row">
            <span className="ui-form-label">{t("clip_helper_opacity")}</span>
            <div className="ui-form-value ui-form-value-stretch">
              <div className="ui-slider-field">
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
          className="ui-panel-section flex flex-col"
          style={{
            flex: 1,
            opacity: clipEnabled ? 1 : 0.4,
            pointerEvents: clipEnabled ? "auto" : "none",
          }}
        >
          <AxisSliderRow
            axis="x"
            label={t("clip_x")}
            active={clipActive.x}
            value={clipValues.x}
            onToggle={(v) => setClipActive({ ...clipActive, x: v })}
            onChange={(val) => setClipValues({ ...clipValues, x: val })}
            disabled={!clipEnabled}
          />
          <AxisSliderRow
            axis="y"
            label={t("clip_y")}
            active={clipActive.y}
            value={clipValues.y}
            onToggle={(v) => setClipActive({ ...clipActive, y: v })}
            onChange={(val) => setClipValues({ ...clipValues, y: val })}
            disabled={!clipEnabled}
          />
          <AxisSliderRow
            axis="z"
            label={t("clip_z")}
            active={clipActive.z}
            value={clipValues.z}
            onToggle={(v) => setClipActive({ ...clipActive, z: v })}
            onChange={(val) => setClipValues({ ...clipValues, z: val })}
            disabled={!clipEnabled}
          />
        </div>

        <div className="ui-panel-footer">
          <Button variant="default" onClick={handleReset} disabled={!clipEnabled}>
            {t("clip_reset") || "重置范围"}
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
};
