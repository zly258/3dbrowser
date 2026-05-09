import React, { useState } from "react";
import { TFunc, Lang } from "../../theme/locales";
import { SceneSettings } from "../../utils/scene-manager/SceneManager";
import { FloatingPanel } from "./FloatingPanel";
import {
    Switch,
    SegmentedControl,
    Select,
    Slider,
    ColorPicker
} from "../common";

type SettingsTab = "general" | "lighting" | "viewport" | "highlight";

const Row: React.FC<{
  label: string;
  children?: React.ReactNode;
  labelWidth?: string;
  stretch?: boolean;
}> = ({ label, children, labelWidth = '80px', stretch = false }) => (
  <div
    className="ui-form-row ui-form-row-tight"
  >
    <span
      className="ui-form-label ui-form-label-dynamic"
      style={{ ["--label-width" as any]: labelWidth }}
    >
      {label}
    </span>
    <div
      className={`ui-form-value ${stretch ? "ui-form-value-stretch" : ""} ${stretch ? "" : "ui-form-value-end"}`}
    >
      {children}
    </div>
  </div>
);

export const SettingsPanel: React.FC<SettingsModalProps> = ({
  t,
  onClose,
  settings,
  onUpdate,
  currentLang,
  setLang,
  showStats,
  setShowStats,
  theme
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabOptions = [
    { value: "general", label: t("setting_general") || "通用" },
    { value: "lighting", label: t("st_lighting") || "光照" },
    { value: "viewport", label: t("st_viewport") || "视口" },
    { value: "highlight", label: t("st_highlight") || "高亮" }
  ];

  return (
    <FloatingPanel
      title={t("settings")}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={400}
      height={400}
      modal={true}
      movable={false}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-settings-panel-body">
        <div className="ui-toolpanel-sticky-tabs">
          <SegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={(value) => setActiveTab(value as SettingsTab)}
          />
        </div>

        {activeTab === "general" && (
          <div className="ui-panel-stack">
            {/* 主题选择已经移除 */}

            {/* 语言选择 */}
            <Row label={t("st_lang")} labelWidth="70px" stretch={true}>
              <Select
                value={currentLang}
                options={[
                  { value: 'zh', label: '简体中文' },
                  { value: 'en', label: 'English' }
                ]}
                onChange={(v) => setLang(v as Lang)}
              />
            </Row>

            {/* 显示统计 */}
            <Row label={t("st_monitor")} labelWidth="70px">
              <Switch
                checked={showStats}
                onChange={(v) => setShowStats(v)}
              />
            </Row>
          </div>
        )}

        {activeTab === "lighting" && (
          <div className="ui-panel-stack">
            <Row label={t("st_ambient") || "环境光"} labelWidth="90px" stretch={true}>
              <div className="ui-slider-field">
                <div className="ui-inline-actions-stretch">
                  <Slider
                    min={0}
                    max={4}
                    step={0.05}
                    value={settings.ambientInt || 0}
                    onChange={(value) => onUpdate({ ambientInt: value })}
                  />
                </div>
                <div className="ui-result-item-secondary-value">
                  {(settings.ambientInt || 0).toFixed(2)}
                </div>
              </div>
            </Row>

            <Row label={t("st_dir") || "主光"} labelWidth="90px" stretch={true}>
              <div className="ui-slider-field">
                <div className="ui-inline-actions-stretch">
                  <Slider
                    min={0}
                    max={4}
                    step={0.05}
                    value={settings.dirInt || 0}
                    onChange={(value) => onUpdate({ dirInt: value })}
                  />
                </div>
                <div className="ui-result-item-secondary-value">
                  {(settings.dirInt || 0).toFixed(2)}
                </div>
              </div>
            </Row>

            <Row label={t("st_back") || "背光"} labelWidth="90px" stretch={true}>
              <div className="ui-slider-field">
                <div className="ui-inline-actions-stretch">
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.backLightInt ?? 0.5}
                    onChange={(value) => onUpdate({ backLightInt: value })}
                  />
                </div>
                <div className="ui-result-item-secondary-value">
                  {(settings.backLightInt ?? 0.5).toFixed(2)}
                </div>
              </div>
            </Row>
          </div>
        )}

        {activeTab === "viewport" && (
          <div className="ui-panel-stack">
          <Row label={t("st_viewcube_size")} labelWidth="90px" stretch={true}>
            <div className="ui-slider-field">
              <div className="ui-inline-actions-stretch">
                <Slider
                  min={120}
                  max={180}
                  step={5}
                  value={settings.viewCubeSize || 120}
                  onChange={(value) => onUpdate({ viewCubeSize: value })}
                />
              </div>
              <div className="ui-result-item-secondary-value ui-result-item-secondary-value-wide">
                {settings.viewCubeSize || 120}px
              </div>
            </div>
          </Row>
          <Row label={t("st_adaptive_quality") || "Adaptive"} labelWidth="90px">
            <Switch
              checked={settings.adaptiveQuality !== false}
              onChange={(v) => onUpdate({ adaptiveQuality: v })}
            />
          </Row>
          <Row label={t("st_performance_profile") || "性能策略"} labelWidth="90px">
            <div className="ui-inline-actions ui-inline-actions-end">
              <SegmentedControl
                options={[
                  { value: 'smooth', label: t("st_perf_smooth") || '流畅优先' },
                  { value: 'balanced', label: t("st_perf_balanced") || '平衡' },
                  { value: 'quality', label: t("st_perf_quality") || '画质优先' }
                ]}
                value={settings.performanceMode || 'balanced'}
                onChange={(v) => onUpdate({ performanceMode: v as 'smooth' | 'balanced' | 'quality' })}
              />
            </div>
          </Row>
          </div>
        )}

        {activeTab === "highlight" && (
          <div className="ui-panel-stack">
          <Row label={t("st_highlight_color") || "高亮颜色"} labelWidth="90px" stretch={true}>
            <ColorPicker
              value={settings.highlightColor || "#ff9f1c"}
              onChange={(value) => onUpdate({ highlightColor: value })}
            />
          </Row>
          <Row label={t("st_highlight_box") || "显示包围盒"} labelWidth="90px">
            <Switch
              checked={settings.highlightShowBox === true}
              onChange={(value) => onUpdate({ highlightShowBox: value })}
            />
          </Row>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};

interface SettingsModalProps {
  t: TFunc;
  onClose: () => void;
  settings: SceneSettings;
  onUpdate: (s: Partial<SceneSettings>) => void;
  currentLang: Lang;
  setLang: (l: Lang) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  theme?: any;
}
