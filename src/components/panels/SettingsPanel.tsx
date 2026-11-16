import React, { useEffect, useState } from "react";
import { TFunc, Lang } from "../../theme/locales";
import { SceneSettings } from "../../utils/scene-manager/SceneManager";
import { FloatingPanel } from "./FloatingPanel";
import {
    Switch,
    SegmentedControl,
    Slider,
    ColorPicker
} from "../common";
import { THEME_PRESETS, ThemeType } from "../../theme/themeManager";

type SettingsTab = "appearance" | "lighting" | "viewport" | "highlight";

const Row: React.FC<{
  label: string;
  children?: React.ReactNode;
  labelWidth?: string;
  stretch?: boolean;
}> = ({ label, children, labelWidth = '112px', stretch = false }) => (
  <div
    className="ui-form-row ui-form-row-tight"
    style={{ ["--label-width" as any]: labelWidth }}
  >
    <span className="ui-form-label ui-form-label-dynamic" title={label}>
      {label}
    </span>
    <div
      className={`ui-form-value ${stretch ? "ui-form-value-stretch" : "ui-form-value-start"}`}
    >
      {children}
    </div>
  </div>
);

/** 设置分组卡片：组标题 + 若干表单行（相似设置归入同一分类） */
const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="ui-settings-group">
    <div className="ui-settings-group-title">{title}</div>
    {children}
  </section>
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
  toolsDock,
  setToolsDock,
  theme,
  getRuntimeInfo
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [runtime, setRuntime] = useState<any>(null);

  useEffect(() => {
    if (!getRuntimeInfo) return;
    const tick = () => setRuntime(getRuntimeInfo());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [getRuntimeInfo]);

  const tabOptions = [
    { value: "appearance", label: t("st_appearance") },
    { value: "lighting", label: t("st_lighting") },
    { value: "viewport", label: t("st_viewport") },
    { value: "highlight", label: t("st_highlight") }
  ];

  const currentThemeType = settings.themeType || "indigo";
  const currentCustomColor = settings.themeCustomColor || "#2563eb";

  const isZh = currentLang === "zh";

  return (
    <FloatingPanel
      title={t("settings")}
      closeLabel={t("panel_close")}
      onClose={onClose}
      width={520}
      height={440}
      modal={true}
      movable={false}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-settings-panel-body">
        <div className="ui-settings-layout">
          <nav className="ui-settings-nav">
            {tabOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`ui-settings-nav-item${activeTab === option.value ? " active" : ""}`}
                onClick={() => setActiveTab(option.value as SettingsTab)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <div className="ui-settings-content">

            {activeTab === "appearance" && (
              <div className="ui-panel-stack">
                <Group title={t("st_group_theme")}>
                  {/* 外观模式（深色/浅色） */}
                  <Row label={t("st_theme_mode")} labelWidth="112px">
                    <SegmentedControl
                      options={[
                        { value: "light", label: t("st_theme_mode_light") },
                        { value: "dark", label: t("st_theme_mode_dark") }
                      ]}
                      value={settings.themeMode || "light"}
                      onChange={(mode) => {
                        const isDark = mode === "dark";
                        const nextBg = isDark
                          ? (settings.bgColor === "#f8fafc" || settings.bgColor === "#fafafa" || settings.bgColor === "#eef1f5" || settings.bgColor === "#eef2f5" || settings.bgColor === "#ffffff" ? "#0b1220" : settings.bgColor)
                          : (settings.bgColor === "#0b1220" || settings.bgColor === "#12171c" || settings.bgColor === "#0b0e11" || settings.bgColor === "#101317" || settings.bgColor === "#121212" ? "#f8fafc" : settings.bgColor);
                        onUpdate({ themeMode: mode as "light" | "dark", bgColor: nextBg });
                      }}
                    />
                  </Row>

                  {/* 主题色 */}
                  <Row label={t("st_theme")} labelWidth="112px">
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
                        title={t("st_custom_color")}
                      >
                        <input
                          type="color"
                          value={
                            currentThemeType === "custom"
                              ? currentCustomColor
                              : (THEME_PRESETS.find((p) => p.key === currentThemeType)?.primary ?? "#2563eb")
                          }
                          onChange={(e) => onUpdate({ themeType: "custom", themeCustomColor: e.target.value })}
                          title={t("st_custom_color")}
                        />
                      </div>
                    </div>
                  </Row>

                  {/* 语言选择 */}
                  <Row label={t("st_lang")} labelWidth="112px">
                    <SegmentedControl
                      options={[
                        { value: 'zh', label: '简体中文' },
                        { value: 'en', label: 'English' }
                      ]}
                      value={currentLang}
                      onChange={(v) => setLang(v as Lang)}
                    />
                  </Row>
                </Group>

                <Group title={t("st_group_layout")}>
                  {/* 工具栏位置：顶栏工具下拉 / 底部居中工具坞 */}
                  <Row label={t("st_tools_dock")} labelWidth="112px">
                    <SegmentedControl
                      options={[
                        { value: "top", label: t("st_tools_dock_top") },
                        { value: "bottom", label: t("st_tools_dock_bottom") }
                      ]}
                      value={toolsDock}
                      onChange={(v) => setToolsDock(v as "top" | "bottom")}
                    />
                  </Row>

                  {/* 显示统计 */}
                  <Row label={t("st_monitor")} labelWidth="112px">
                    <Switch
                      checked={showStats}
                      onChange={(v) => setShowStats(v)}
                    />
                  </Row>
                </Group>

                <Group title={t("st_group_interaction")}>
                  <Row label={t("st_locate_mode")} labelWidth="112px">
                    <SegmentedControl
                      options={[
                        { value: "normal", label: t("st_locate_mode_normal") },
                        { value: "isolate", label: t("st_locate_mode_isolate") }
                      ]}
                      value={settings.locateIsolateMode === true ? "isolate" : "normal"}
                      onChange={(v) => onUpdate({ locateIsolateMode: v === "isolate" })}
                    />
                  </Row>
                  <div className="ui-toolpanel-caption ui-toolpanel-caption-muted ui-settings-hint">
                    {settings.locateIsolateMode === true
                      ? t("st_locate_mode_isolate_hint")
                      : t("st_locate_mode_normal_hint")}
                  </div>
                </Group>
              </div>
            )}

            {activeTab === "lighting" && (
              <div className="ui-panel-stack">
                <Group title={t("st_group_lighting")}>
                  <Row label={t("st_ambient")} labelWidth="112px" stretch={true}>
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

                  <Row label={t("st_dir")} labelWidth="112px" stretch={true}>
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

                  <Row label={t("st_back")} labelWidth="112px" stretch={true}>
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
                </Group>
              </div>
            )}

            {activeTab === "viewport" && (
              <div className="ui-panel-stack">
                <Group title={t("st_group_viewport")}>
                  <Row label={t("st_bg")} labelWidth="112px">
                    <ColorPicker
                      value={settings.bgColor || (settings.themeMode === 'dark' ? "#0b1220" : "#f8fafc")}
                      onChange={(value) => onUpdate({ bgColor: value })}
                    />
                  </Row>

                  <Row label={t("st_viewcube_size")} labelWidth="112px" stretch={true}>
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
                </Group>

                <Group title={t("st_group_performance")}>
                  <Row label={t("st_performance_profile")} labelWidth="112px">
                    <div className="ui-inline-actions">
                      <SegmentedControl
                        options={[
                          { value: 'smooth', label: t("st_perf_smooth") },
                          { value: 'balanced', label: t("st_perf_balanced") },
                          { value: 'quality', label: t("st_perf_quality") }
                        ]}
                        value={settings.performanceMode || 'balanced'}
                        onChange={(v) => onUpdate({ performanceMode: v as 'smooth' | 'balanced' | 'quality' })}
                      />
                    </div>
                  </Row>

                  <Row label={t("st_adaptive_quality")} labelWidth="112px">
                    <Switch
                      checked={settings.adaptiveQuality !== false}
                      onChange={(v) => onUpdate({ adaptiveQuality: v })}
                    />
                  </Row>

                  <Row label={t("st_frustum_culling")} labelWidth="112px">
                    <Switch
                      checked={settings.frustumCulling !== false}
                      onChange={(v) => onUpdate({ frustumCulling: v })}
                    />
                  </Row>

                  <Row label={t("st_auto_evict")} labelWidth="112px">
                    <Switch
                      checked={settings.autoResident !== false}
                      onChange={(v) => onUpdate({ autoResident: v })}
                    />
                  </Row>

                  <Row label={t("st_residency")} labelWidth="112px" stretch>
                    <span className="ui-toolpanel-caption ui-toolpanel-caption-muted">
                      {runtime
                        ? `${runtime.loaded}/${runtime.total} · ${(runtime.estimatedResidentMB / 1024).toFixed(2)}GB / ${(runtime.residentBudgetMB / 1024).toFixed(2)}GB${runtime.memoryPressure ? (isZh ? ' · 内存压力' : ' · Pressure') : ''}`
                        : '—'}
                    </span>
                  </Row>

                  <div className="ui-toolpanel-caption ui-toolpanel-caption-muted ui-settings-hint">
                    {t("st_viewport_perf_hint")}
                  </div>
                </Group>
              </div>
            )}

            {activeTab === "highlight" && (
              <div className="ui-panel-stack">
                <Group title={t("st_group_highlight")}>
                  <Row label={t("st_highlight_color")} labelWidth="112px">
                    <ColorPicker
                      value={settings.highlightColor || "#2563eb"}
                      onChange={(value) => onUpdate({ highlightColor: value })}
                    />
                  </Row>

                  <Row label={t("st_highlight_box")} labelWidth="112px">
                    <Switch
                      checked={settings.highlightShowBox === true}
                      onChange={(value) => onUpdate({ highlightShowBox: value })}
                    />
                  </Row>

                  <div className="ui-toolpanel-caption ui-toolpanel-caption-muted ui-settings-hint">
                    {t("st_highlight_box_hint")}
                  </div>
                </Group>
              </div>
            )}
          </div>
        </div>
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
  /** 工具栏位置：top = 顶栏「工具」下拉；bottom = 底部居中工具坞 */
  toolsDock: "top" | "bottom";
  setToolsDock: (v: "top" | "bottom") => void;
  theme?: any;
  getRuntimeInfo?: () => {
    loaded: number;
    total: number;
    estimatedResidentMB: number;
    residentBudgetMB: number;
    fitsAll: boolean;
    memoryPressure: boolean;
  };
}
