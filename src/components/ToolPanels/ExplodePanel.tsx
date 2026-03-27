import React from "react";
import { TFunc } from "../../theme/Locales";
import { FloatingPanel } from "./FloatingPanel";
import { Switch, Slider, Button } from "../common";

interface ExplodePanelProps {
  t: TFunc;
  onClose: () => void;
  enabled: boolean;
  strength: number;
  onEnabledChange: (value: boolean) => void;
  onStrengthChange: (value: number) => void;
  onReset: () => void;
  theme?: any;
}

const Row: React.FC<{
  label: string;
  children: React.ReactNode;
  stretch?: boolean;
}> = ({ label, children, stretch = false }) => (
  <div
    className="flex items-center justify-between"
    style={{ marginBottom: "8px", minHeight: "28px", gap: "12px" }}
  >
    <span
      className="text-sm text-secondary flex-shrink-0"
      style={{ minWidth: "84px" }}
    >
      {label}
    </span>
    <div
      className="flex items-center"
      style={{
        flex: stretch ? 1 : "0 1 auto",
        justifyContent: stretch ? "flex-start" : "flex-end",
        minWidth: stretch ? 0 : undefined
      }}
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
  onEnabledChange,
  onStrengthChange,
  onReset,
  theme
}) => {
  return (
    <FloatingPanel
      title={t("explode_title") || "爆炸图"}
      onClose={onClose}
      width={340}
      storageId="tool_explode"
      modal={false}
      autoHeight={true}
      theme={theme}
    >
      <div
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >
        <Row label={t("explode_enable") || "启用"}>
          <Switch checked={enabled} onChange={onEnabledChange} />
        </Row>
        <Row label={t("explode_strength") || "强度"} stretch={true}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={strength}
                onChange={onStrengthChange}
              />
            </div>
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: "12px",
                minWidth: "42px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {strength}%
            </div>
          </div>
        </Row>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px" }}>
          <Button variant="ghost" className="ui-properties-action" onClick={onReset}>
            {t("explode_reset") || "重置"}
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
};
