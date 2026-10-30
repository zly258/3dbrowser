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
import { THEME_PRESETS, ThemeType } from "../../theme/themeManager";

type SettingsTab = "general" | "lighting" | "viewport" | "highlight";

const Row: React.FC<{
  label: string;
  children?: React.ReactNode;
  labelWidth?: string;
  stretch?: boolean;
}> = ({ label, children, labelWidth = '80px', stretch = false }) => (
  <div className="ui-form-row ui-form-row-tight">
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

  const currentThemeType = settings.themeType || "indigo";
  const currentCustomColor = settings.themeCustomColor || "#1976d2";

  const isZh = currentLang === "zh";

  return (
    <FloatingPanel
      title={t("settings")}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={440}
      autoHeight={true}
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

            {/* 外观模式（深色/浅色） */}
            <Row label={t("st_theme_mode") || "外观模式"} labelWidth="70px" stretch={true}>
              <SegmentedControl
                options={[
                  { value: "light", label: t("st_theme_mode_light") || "浅色" },
                  { value: "dark", label: t("st_theme_mode_dark") || "深色" }
                ]}
                value={settings.themeMode || "light"}
                onChange={(mode) => {
                  const isDark = mode === "dark";
                  const nextBg = isDark
                    ? (settings.bgColor === "#fafafa" || settings.bgColor === "#f8fafc" || settings.bgColor === "#eef2f5" ? "#121212" : settings.bgColor)
                    : (settings.bgColor === "#121212" ? "#fafafa" : settings.bgColor);
                  onUpdate({ themeMode: mode as "light" | "dark", bgColor: nextBg });
                }}
              />
            </Row>

            {/* 主题色 */}
            <Row label={t("st_theme") || "主题配色"} labelWidth="70px" stretch={true}>
              <div className="ui-theme-picker">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    title={isZh ? preset.labelZh : preset.labelEn}
                    className={`ui-theme-swatch${currentThemeType === preset.key ? " active" : ""}`}
                    style={{ background: preset.swatch }}
                    onClick={() => onUpdate({ themeType: preset.key, themeCustomColor: undefined })}
                  />
                ))}
                {/* 自定义色 */}
                <div
                  className={`ui-theme-swatch ui-theme-swatch-custom${currentThemeType === "custom" ? " active" : ""}`}
                  title={isZh ? "自定义颜色" : "Custom color"}
                >
                  <input
                    type="color"
                    value={currentThemeType === "custom" ? currentCustomColor : "#1976d2"}
                    onChange={(e) => onUpdate({ themeType: "custom", themeCustomColor: e.target.value })}
                    title={isZh ? "自定义颜色" : "Custom color"}
                  />
                </div>
              </div>
            </Row>

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
            <Row label={t("st_monitor")} labelWidth="82px">
              <Switch
                checked={showStats}
                onChange={(v) => setShowStats(v)}
              />
            </Row>

            <Row label={t("st_locate_mode") || "定位方式"} labelWidth="82px" stretch={true}>
              <SegmentedControl
                options={[
                  { value: "normal", label: t("st_locate_mode_normal") || "普通定位" },
                  { value: "isolate", label: t("st_locate_mode_isolate") || "隔离定位" }
                ]}
                value={settings.locateIsolateMode === true ? "isolate" : "normal"}
                onChange={(v) => onUpdate({ locateIsolateMode: v === "isolate" })}
              />
            </Row>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-muted ui-settings-hint">
              {settings.locateIsolateMode === true
                ? (t("st_locate_mode_isolate_hint") || "定位时临时隐藏其他对象，大模型恢复时可能较慢。")
                : (t("st_locate_mode_normal_hint") || "只移动视图并高亮对象，速度最快。")}
            </div>
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
          <Row label={t("st_bg") || "背景颜色"} labelWidth="90px" stretch={true}>
            <ColorPicker
              value={settings.bgColor || (settings.themeMode === 'dark' ? "#121212" : "#fafafa")}
              onChange={(value) => onUpdate({ bgColor: value })}
            />
          </Row>
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
          <Row label={t("st_highlight_box") || "高亮/定位包围盒"} labelWidth="110px">
            <Switch
              checked={settings.highlightShowBox === true}
              onChange={(value) => onUpdate({ highlightShowBox: value })}
            />
          </Row>
          <div className="ui-toolpanel-caption ui-toolpanel-caption-muted ui-settings-hint">
            {t("st_highlight_box_hint") || "开启后，高亮和定位都会显示包围盒；关闭后只保留颜色高亮和视图定位。"}
          </div>
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
