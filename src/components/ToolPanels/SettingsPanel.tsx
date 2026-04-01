import React, { useState } from "react";
import { TFunc, Lang } from "../../theme/Locales";
import { SceneSettings } from "../../utils/SceneManager";
import { FloatingPanel } from "./FloatingPanel";
import {
    Switch,
    SegmentedControl,
    Select,
    Slider,
    ColorPicker
} from "../common";

type SettingsTab = "general" | "viewport" | "import" | "highlight";

/**
 * Row - 设置面板中的行布局组件
 * 用于标签和控件的水平排列
 */
const Row: React.FC<{
  label: string;       // 行标签文本
  children?: React.ReactNode;  // 行控件
  labelWidth?: string; // 标签宽度
  stretch?: boolean;   // 是否拉伸子控件填充剩余空间
}> = ({ label, children, labelWidth = '80px', stretch = false }) => (
  <div
    className="flex items-center justify-between"
    style={{ marginBottom: '6px', minHeight: '26px', gap: '12px' }}
  >
    <span
      className="text-sm text-secondary flex-shrink-0"
      style={{
        minWidth: labelWidth,
      }}
    >
      {label}
    </span>
    <div
      className="flex items-center"
      style={{
        flex: stretch ? 1 : '0 1 auto',  // stretch时flex:1，否则不伸缩
        justifyContent: stretch ? 'flex-start' : 'flex-end',
        minWidth: stretch ? 0 : undefined,  // stretch时允许缩小
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * SettingsPanel - 设置面板主组件
 * 提供主题、语言、字体大小和大模型优先相关配置
 */
export const SettingsPanel: React.FC<SettingsModalProps> = ({
  t,              // 翻译函数
  onClose,        // 关闭回调
  settings,       // 场景设置
  onUpdate,       // 设置更新回调
  currentLang,    // 当前语言
  setLang,        // 设置语言回调
  themeMode,      // 主题模式
  setThemeMode,   // 设置主题回调
  showStats,      // 是否显示统计
  setShowStats,   // 设置统计显示回调
  // 样式配置
  theme           // 主题配置
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabOptions = [
    { value: "general", label: t("setting_general") || "通用" },
    { value: "viewport", label: t("st_viewport") || "视口" },
    { value: "import", label: t("st_import_settings") || "导入" },
    { value: "highlight", label: t("st_highlight") || "高亮" }
  ];

  return (
    <FloatingPanel
      title={t("settings")}
      onClose={onClose}
      width={360}
      height={400}
      modal={true}
      movable={false}
      theme={theme}
    >
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', overflowY: 'auto' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-panel)', paddingBottom: '6px' }}>
          <SegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={(value) => setActiveTab(value as SettingsTab)}
          />
        </div>

        {activeTab === "general" && (
          <div className="mb-2" style={{ padding: '0 6px' }}>
            {/* 主题选择 */}
            <Row label={t("st_theme")} labelWidth="70px">
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <SegmentedControl
                  options={[
                    { value: 'light', label: t("theme_light") || 'Light' },
                    { value: 'dark', label: t("theme_dark") || 'Dark' }
                  ]}
                  value={themeMode}
                  onChange={(v) => setThemeMode(v as 'dark' | 'light')}
                />
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
            <Row label={t("st_monitor")} labelWidth="70px">
              <Switch
                checked={showStats}
                onChange={(v) => setShowStats(v)}
              />
            </Row>
          </div>
        )}

        {activeTab === "viewport" && (
          <div className="mb-2" style={{ padding: '0 6px' }}>
          <Row label={t("st_viewcube_size")} labelWidth="90px" stretch={true}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Slider
                  min={120}
                  max={180}
                  step={5}
                  value={settings.viewCubeSize || 120}
                  onChange={(value) => onUpdate({ viewCubeSize: value })}
                />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', minWidth: '44px', textAlign: 'right' }}>
                {settings.viewCubeSize || 100}px
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
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
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

        {activeTab === "import" && (
          <div className="mb-2" style={{ padding: '0 6px' }}>
          <Row label={t("ifc_grid_visible") || "IFC 轴网"} labelWidth="90px">
            <Switch
              checked={settings.ifcGridVisible !== false}
              onChange={(v) => onUpdate({ ifcGridVisible: v })}
            />
          </Row>
          </div>
        )}

        {activeTab === "highlight" && (
          <div className="mb-2" style={{ padding: '0 6px' }}>
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

/**
 * SettingsModalProps - 设置面板属性接口
 */
interface SettingsModalProps {
  t: TFunc;                    // 翻译函数
  onClose: () => void;        // 关闭回调
  settings: SceneSettings;     // 场景设置
  onUpdate: (s: Partial<SceneSettings>) => void;  // 更新设置回调
  currentLang: Lang;           // 当前语言
  setLang: (l: Lang) => void; // 设置语言回调
  themeMode: 'dark' | 'light'; // 当前主题模式
  setThemeMode: (m: 'dark' | 'light') => void;  // 设置主题回调
  showStats: boolean;          // 是否显示统计信息
  setShowStats: (v: boolean) => void;  // 设置统计显示回调
                  // 自定义样式
  theme?: any;                 // 主题配置
}
