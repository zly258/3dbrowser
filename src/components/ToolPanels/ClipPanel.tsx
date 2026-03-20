import React from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Switch, DualSlider } from "../common";

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
  styles?: any;
  theme?: any;
}

// Axis Slider Row
const AxisSliderRow: React.FC<{
  axis: 'x' | 'y' | 'z';
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
        gap: '8px',
        padding: '6px 0',
        borderBottom: '1px solid var(--border-color)',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Axis label */}
      <span
        style={{
          fontSize: '12px',
          fontWeight: '600',
          minWidth: '16px',
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
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
          fontFamily: "'Consolas', 'Monaco', monospace",
          fontSize: '11px',
          color: 'var(--accent)',
          minWidth: '45px',
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {Math.round(value[0])}-{Math.round(value[1])}%
      </span>
    </div>
  );
};

export const ClipPanel: React.FC<ClipPanelProps> = ({
  t, onClose, clipEnabled, setClipEnabled,
  clipValues, setClipValues, clipActive, setClipActive,
}) => {
  return (
    <FloatingPanel
      title={t("clip_title")}
      onClose={onClose}
      width={280}
      height={260}
      resizable={false}
      storageId="tool_clip"
    >
      <div className="flex flex-col p-3" style={{ height: '100%', gap: '12px' }}>
        {/* Header with main switch */}
        <div className="flex items-center justify-between p-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <span className="text-sm font-semibold">{t("clip_enable")}</span>
          <Switch
            checked={clipEnabled}
            onChange={(v) => setClipEnabled(v)}
          />
        </div>

        {/* Axis controls */}
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            opacity: clipEnabled ? 1 : 0.4,
            pointerEvents: clipEnabled ? 'auto' : 'none',
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
      </div>
    </FloatingPanel>
  );
};
