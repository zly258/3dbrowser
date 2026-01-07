
import React from "react";
import { IconClose } from "../theme/Icons";
import { TFunc, Lang } from "../theme/Locales";
import { SceneSettings, AxisOption } from "../utils/SceneManager";

interface SettingsModalProps {
    t: TFunc;
    onClose: () => void;
    settings: SceneSettings;
    onUpdate: (s: Partial<SceneSettings>) => void;
    currentLang: Lang;
    setLang: (l: Lang) => void;
    themeMode: 'dark' | 'light';
    setThemeMode: (m: 'dark' | 'light') => void;
    showStats: boolean;
    setShowStats: (v: boolean) => void;
    fontFamily: string;
    setFontFamily: (f: string) => void;
    accentColor: string;
    setAccentColor: (c: string) => void;
    styles: any;
    theme: any;
}

const Section = ({ title, children, theme }: { title: string, children?: React.ReactNode, theme: any }) => (
    <div style={{marginBottom: 16}}>
        <div style={{fontSize: 11, fontWeight: 'bold', color: theme.accent, marginBottom: 8, borderBottom:`1px solid ${theme.border}`, paddingBottom:4}}>
            {title}
        </div>
        {children}
    </div>
);

const Row = ({ label, children, theme }: { label: string, children?: React.ReactNode, theme: any }) => (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6, fontSize:12}}>
        <span style={{color: theme.textMuted}}>{label}</span>
        <div style={{flex:1, display:'flex', justifyContent:'flex-end', marginLeft: 10}}>
            {children}
        </div>
    </div>
);

const AxisSelector = ({ value, onChange, theme, t }: { value: string, onChange: (v: AxisOption) => void, theme: any, t: TFunc }) => (
    <select 
        style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:6}}
        value={value}
        onChange={(e) => onChange(e.target.value as AxisOption)}
    >
        <option value="+x">{t("axis_px")}</option>
        <option value="-x">{t("axis_nx")}</option>
        <option value="+y">{t("axis_py")}</option>
        <option value="-y">{t("axis_ny")}</option>
        <option value="+z">{t("axis_pz")}</option>
        <option value="-z">{t("axis_nz")}</option>
    </select>
);

export const SettingsPanel: React.FC<SettingsModalProps> = ({ 
    t, onClose, settings, onUpdate, currentLang, setLang, themeMode, setThemeMode, accentColor, setAccentColor,
    showStats, setShowStats, fontFamily, setFontFamily, styles, theme 
}) => {
    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <div style={styles.floatingHeader}>
                    <span>{t("settings")}</span>
                    <div 
                        onClick={onClose} 
                        style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 4 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <IconClose width={20} height={20} />
                    </div>
                </div>
                
                <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
                    <Section title={t("setting_general")} theme={theme}>
                        <Row label={t("st_theme")} theme={theme}>
                            <div style={{display:'flex', gap:4, background:theme.bg, padding:2, borderRadius:8, border:`1px solid ${theme.border}`}}>
                                <button 
                                    onClick={() => setThemeMode('light')}
                                    style={{
                                        padding:'4px 12px', borderRadius:6, border:'none', fontSize:11, cursor:'pointer',
                                        background: themeMode === 'light' ? theme.accent : 'transparent',
                                        color: themeMode === 'light' ? 'white' : theme.text
                                    }}
                                >
                                    {t("theme_light")}
                                </button>
                                <button 
                                    onClick={() => setThemeMode('dark')}
                                    style={{
                                        padding:'4px 12px', borderRadius:6, border:'none', fontSize:11, cursor:'pointer',
                                        background: themeMode === 'dark' ? theme.accent : 'transparent',
                                        color: themeMode === 'dark' ? 'white' : theme.text
                                    }}
                                >
                                    {t("theme_dark")}
                                </button>
                            </div>
                        </Row>

                        <Row label={t("st_accent_color")} theme={theme}>
                            <input 
                                type="color" 
                                value={accentColor} 
                                onChange={(e) => {
                                    setAccentColor(e.target.value);
                                    localStorage.setItem('3dbrowser_accentColor', e.target.value);
                                }}
                                style={{ width: 40, height: 24, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                            />
                        </Row>

                        <Row label={t("st_lang")} theme={theme}>
                            <select 
                                style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:6}}
                                value={currentLang}
                                onChange={(e) => setLang(e.target.value as Lang)}
                            >
                                <option value="zh">简体中文</option>
                                <option value="en">English</option>
                            </select>
                        </Row>
                        <Row label={t("st_font_family")} theme={theme}>
                            <select 
                                style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:6}}
                                value={fontFamily}
                                onChange={(e) => setFontFamily(e.target.value)}
                            >
                                <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                                <option value="'SimSun', serif">宋体</option>
                                <option value="'SimHei', sans-serif">黑体</option>
                                <option value="'Arial', sans-serif">Arial</option>
                                <option value="'Times New Roman', serif">Times New Roman</option>
                            </select>
                        </Row>
                        <Row label={t("st_bg")} theme={theme}>
                            <input type="color" value={settings.bgColor} onChange={(e) => onUpdate({bgColor: e.target.value})} />
                        </Row>
                        <Row label={t("st_monitor")} theme={theme}>
                             <input type="checkbox" checked={showStats} onChange={(e) => setShowStats(e.target.checked)} style={{accentColor: theme.accent}} />
                        </Row>
                    </Section>

                    <Section title={t("st_import_settings")} theme={theme}>
                        <Row label={t("st_imp_glb")} theme={theme}>
                            <AxisSelector value={settings.importAxisGLB} onChange={(v) => onUpdate({importAxisGLB: v})} theme={theme} t={t} />
                        </Row>
                        <Row label={t("st_imp_ifc")} theme={theme}>
                             <AxisSelector value={settings.importAxisIFC} onChange={(v) => onUpdate({importAxisIFC: v})} theme={theme} t={t} />
                        </Row>
                        <Row label={t("st_instancing")} theme={theme}>
                             <input type="checkbox" checked={settings.enableInstancing} onChange={(e) => onUpdate({enableInstancing: e.target.checked})} style={{accentColor: theme.accent}} />
                        </Row>
                    </Section>

                    <Section title={t("st_lighting")} theme={theme}>
                        <Row label={`${t("st_ambient")} (${settings.ambientInt.toFixed(1)})`} theme={theme}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.ambientInt} 
                                onChange={(e) => onUpdate({ambientInt: parseFloat(e.target.value)})} 
                                style={styles.rangeSlider}/>
                        </Row>
                        <Row label={`${t("st_dir")} (${settings.dirInt.toFixed(1)})`} theme={theme}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.dirInt} 
                                onChange={(e) => onUpdate({dirInt: parseFloat(e.target.value)})} 
                                style={styles.rangeSlider}/>
                        </Row>
                    </Section>
                </div>
            </div>
        </div>
    );
};
