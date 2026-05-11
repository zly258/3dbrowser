import React from "react";
import { TFunc } from "../../theme/locales";
import { FloatingPanel } from "./FloatingPanel";
import { Switch, Slider, Button, SegmentedControl } from "../common";

type ExplodeMode = "radial" | "horizontal" | "vertical";

interface ExplodePanelProps {
  t: TFunc;
  onClose: () => void;
  enabled: boolean;
  strength: number;
  mode: ExplodeMode;
  onEnabledChange: (value: boolean) => void;
  onStrengthChange: (value: number) => void;
  onModeChange: (value: ExplodeMode) => void;
  onReset: () => void;
  theme?: any;
}

const Row: React.FC<{
  label: string;
  children: React.ReactNode;
  stretch?: boolean;
}> = ({ label, children, stretch = false }) => (
  <div
    className="ui-form-row ui-form-row-tight"
  >
    <span className="ui-form-label">
      {label}
    </span>
    <div
      className={`ui-form-value${stretch ? " ui-form-value-stretch ui-form-value-start" : ""}`}
    >
      {children}
    </div>
  </div>
);

export const ExplodePanel: React.FC<ExplodePanelProps> = ({
  t,
  onClose,
  enabled,
  strength,
  mode,
  onEnabledChange,
  onStrengthChange,
  onModeChange,
  onReset,
  theme
}) => {
  return (
    <FloatingPanel
      title={t("explode_title") || "爆炸图"}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={360}
      storageId="tool_explode"
      modal={false}
      autoHeight={true}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-toolpanel-body-compact">
        <Row label={t("explode_enable") || "启用"}>
          <Switch checked={enabled} onChange={onEnabledChange} />
        </Row>
        <Row label={t("explode_strength") || "强度"} stretch={true}>
          <div className="ui-slider-field">
            <div className="ui-inline-actions-stretch">
              <Slider
                min={0}
                max={100}
                step={1}
                value={strength}
                onChange={onStrengthChange}
              />
            </div>
            <div className="ui-slider-value ui-slider-value-strong">
              {strength}%
            </div>
          </div>
        </Row>
        <Row label={t("explode_mode") || "方向"} stretch={true}>
          <SegmentedControl
            options={[
              { value: "radial", label: t("explode_mode_radial") || "四周" },
              { value: "horizontal", label: t("explode_mode_horizontal") || "横向" },
              { value: "vertical", label: t("explode_mode_vertical") || "纵向" }
            ]}
            value={mode}
            onChange={(value) => onModeChange(value as ExplodeMode)}
          />
        </Row>
        <div className="ui-panel-footer ui-panel-footer-spaced">
          <Button className="ui-properties-action" onClick={onReset}>
            {t("explode_reset") || "重置"}
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
};
