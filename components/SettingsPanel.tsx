

import React from "react";
import { IconClose } from "../Icons";
import { TFunc, Lang } from "../utils/Locales";
import { SceneSettings, AxisOption } from "../SceneManager";

interface SettingsModalProps {
    t: TFunc;
    onClose: () => void;
    settings: SceneSettings;
    onUpdate: (s: Partial<SceneSettings>) => void;
    currentLang: Lang;
    setLang: (l: Lang) => void;
    themeMode: 'dark' | 'light';
    setThemeMode: (m: 'dark' | 'light') => void;
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
        style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:2}}
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

export const SettingsPanel: React.FC<SettingsModalProps> = ({ t, onClose, settings, onUpdate, currentLang, setLang, themeMode, setThemeMode, styles, theme }) => {
    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <div style={styles.floatingHeader}>
                    <span>{t("settings")}</span>
                    <div onClick={onClose} style={{ cursor: 'pointer' }}><IconClose /></div>
                </div>
                
                <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
                    <Section title={t("setting_general")} theme={theme}>
                        <Row label={t("st_lang")} theme={theme}>
                            <select 
                                style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:2}}
                                value={currentLang}
                                onChange={(e) => setLang(e.target.value as Lang)}
                            >
                                <option value="zh">中文 (Chinese)</option>
                                <option value="en">English</option>
                            </select>
                        </Row>
                        <Row label={t("st_theme")} theme={theme}>
                            <select 
                                style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:2}}
                                value={themeMode}
                                onChange={(e) => setThemeMode(e.target.value as 'dark' | 'light')}
                            >
                                <option value="dark">{t("theme_dark")}</option>
                                <option value="light">{t("theme_light")}</option>
                            </select>
                        </Row>
                        <Row label={t("st_bg")} theme={theme}>
                            <input type="color" value={settings.bgColor} onChange={(e) => onUpdate({bgColor: e.target.value})} />
                        </Row>
                    </Section>

                    <Section title={t("st_import_settings")} theme={theme}>
                        <Row label={t("st_imp_glb")} theme={theme}>
                            <AxisSelector value={settings.importAxisGLB} onChange={(v) => onUpdate({importAxisGLB: v})} theme={theme} t={t} />
                        </Row>
                        <Row label={t("st_imp_ifc")} theme={theme}>
                             <AxisSelector value={settings.importAxisIFC} onChange={(v) => onUpdate({importAxisIFC: v})} theme={theme} t={t} />
                        </Row>
                    </Section>

                    <Section title={t("st_lighting")} theme={theme}>
                        <Row label={`${t("st_ambient")} (${settings.ambientInt.toFixed(1)})`} theme={theme}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.ambientInt} 
                                onChange={(e) => onUpdate({ambientInt: parseFloat(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                        <Row label={`${t("st_dir")} (${settings.dirInt.toFixed(1)})`} theme={theme}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.dirInt} 
                                onChange={(e) => onUpdate({dirInt: parseFloat(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                    </Section>

                    <Section title={t("st_opt")} theme={theme}>
                        <Row label={t("st_opt_progressive")} theme={theme}>
                            <input type="checkbox" checked={settings.progressive} onChange={(e) => onUpdate({progressive: e.target.checked})} />
                        </Row>
                        {settings.progressive && (
                            <>
                                <Row label={`${t("st_opt_ratio")} (${Math.round(settings.hideRatio * 100)}%)`} theme={theme}>
                                    <input type="range" min="0.1" max="0.9" step="0.1" 
                                        value={settings.hideRatio} 
                                        onChange={(e) => onUpdate({hideRatio: parseFloat(e.target.value)})} 
                                        style={{width: 100}}/>
                                </Row>
                                <Row label={t("st_opt_threshold")} theme={theme}>
                                    <input type="number" 
                                        value={settings.progressiveThreshold} 
                                        onChange={(e) => onUpdate({progressiveThreshold: parseInt(e.target.value)})} 
                                        style={{width: 80, background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`}}
                                    />
                                </Row>
                            </>
                        )}
                    </Section>
                    
                    <Section title={t("st_tiles")} theme={theme}>
                        <Row label={`${t("st_sse")} (${settings.sse})`} theme={theme}>
                            <input type="range" min="1" max="50" step="1" 
                                value={settings.sse} 
                                onChange={(e) => onUpdate({sse: parseInt(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                        <Row label={`${t("st_mem")} (${settings.maxMemory} MB)`} theme={theme}>
                            <input type="number" 
                                value={settings.maxMemory} 
                                onChange={(e) => onUpdate({maxMemory: parseInt(e.target.value)})} 
                                style={{width: 60, background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`}}/>
                        </Row>
                    </Section>
                </div>
            </div>
        </div>
    );
};
