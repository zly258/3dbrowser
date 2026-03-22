import React from "react";
import { TFunc, Lang } from "../../theme/Locales";
import { SceneSettings } from "../../utils/SceneManager";
import { FloatingPanel } from "./FloatingPanel";
import {
    Switch,
    SegmentedControl,
    SettingSlider,
    Select
} from "../common";

/**
 * Section - 设置面板中的分节组件
 * 用于将相关设置项分组显示，带有标题和分隔线
 */
const Section: React.FC<{
  title: string;      // 分节标题
  children?: React.ReactNode;  // 分节内容
}> = ({ title, children }) => (
  <div className="mb-4">
    <div
      className="text-xs font-semibold uppercase"
      style={{
        marginBottom: '10px',
        paddingBottom: '6px',
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border-color)',
        letterSpacing: '0.5px',
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

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
    style={{ marginBottom: '10px', minHeight: '28px', gap: '16px' }}
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
 * 提供主题、语言、字体大小、视口、灯光等配置选项
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
  return (
    <FloatingPanel
      title={t("settings")}
      onClose={onClose}
      width={360}
      height={500}
      modal={true}
      theme={theme}
    >
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', overflowY: 'auto' }}>
        {/* 通用设置 */}
        <Section title={t("setting_general")}>
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

            {/* 字体大小 */}
            <Row label={t("st_font_size")} labelWidth="70px">
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <SegmentedControl
                  options={[
                    { value: 'compact', label: t("st_font_compact") || '紧凑' },
                    { value: 'medium', label: t("st_font_medium") || '中等' },
                    { value: 'loose', label: t("st_font_loose") || '宽松' }
                  ]}
                  value={settings.fontSize || 'medium'}
                  onChange={(v) => onUpdate({ fontSize: v as 'compact' | 'medium' | 'loose' })}
                />
              </div>
            </Row>
        </Section>

        {/* 视口设置 */}
        <Section title={t("st_viewport")}>
          <Row label={t("st_viewcube_size")} labelWidth="90px" stretch={true}>
            <SettingSlider
              min={100}
              max={300}
              step={10}
              value={settings.viewCubeSize || 100}
              onChange={(v) => onUpdate({ viewCubeSize: v })}
            />
          </Row>
        </Section>

        {/* 灯光设置 */}
        <Section title={t("st_lighting")}>
          {/* 环境光强度 */}
          <Row label={t("st_ambient")} labelWidth="90px" stretch={true}>
            <SettingSlider
              min={0}
              max={5}
              step={0.1}
              value={settings.ambientInt}
              onChange={(v) => onUpdate({ ambientInt: v })}
            />
          </Row>
          {/* 定向光强度 */}
          <Row label={t("st_dir")} labelWidth="90px" stretch={true}>
            <SettingSlider
              min={0}
              max={5}
              step={0.1}
              value={settings.dirInt}
              onChange={(v) => onUpdate({ dirInt: v })}
            />
          </Row>
        </Section>
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
