
import React from "react";
import { IconClose } from "../theme/Icons";
import { TFunc, Lang } from "../theme/Locales";
import { SceneSettings } from "../utils/SceneManager";
import { Slider } from "./CommonUI";
import { Checkbox } from "./ToolPanels";

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
    styles: any;
    theme: any;
}

const Section = ({ title, children, theme }: { title: string, children?: React.ReactNode, theme: any }) => (
    <div style={{marginBottom: 20}}>
        <div style={{fontSize: 11, fontWeight: '600', color: theme.accent, marginBottom: 10, borderBottom:`1px solid ${theme.border}`, paddingBottom:6, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px'}}>
            {title}
        </div>
        {children}
    </div>
);

const Row = ({ label, children, theme }: { label: string, children?: React.ReactNode, theme: any }) => (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8, fontSize:12, padding: '0 4px'}}>
        <span style={{color: theme.textMuted, fontWeight: '400'}}>{label}</span>
        <div style={{flex:1, display:'flex', justifyContent:'flex-end', marginLeft: 12}}>
            {children}
        </div>
    </div>
);

export const SettingsPanel: React.FC<SettingsModalProps> = ({ 
    t, onClose, settings, onUpdate, currentLang, setLang, themeMode, setThemeMode,
    showStats, setShowStats, styles, theme 
}) => {
    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <div style={styles.floatingHeader}>
                    <span>{t("settings")}</span>
                    <div 
                        onClick={onClose} 
                        style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 0 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <IconClose width={20} height={20} />
                    </div>
                </div>
                
                <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
                    <Section title={t("setting_general")} theme={theme}>
                        <Row label={t("st_theme")} theme={theme}>
                            <div style={{display:'flex', gap:4, background:theme.bg, padding:2, borderRadius:0, border:`1px solid ${theme.border}`}}>
                                <button 
                                    onClick={() => setThemeMode('light')}
                                    style={{
                                        padding:'4px 12px', borderRadius:0, border:'none', fontSize:11, cursor:'pointer',
                                        background: themeMode === 'light' ? theme.accent : 'transparent',
                                        color: themeMode === 'light' ? 'white' : theme.text
                                    }}
                                >
                                    {t("theme_light")}
                                </button>
                                <button 
                                    onClick={() => setThemeMode('dark')}
                                    style={{
                                        padding:'4px 12px', borderRadius:0, border:'none', fontSize:11, cursor:'pointer',
                                        background: themeMode === 'dark' ? theme.accent : 'transparent',
                                        color: themeMode === 'dark' ? 'white' : theme.text
                                    }}
                                >
                                    {t("theme_dark")}
                                </button>
                            </div>
                        </Row>

                        <Row label={t("st_lang")} theme={theme}>
                            <select 
                                style={{background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding:2, borderRadius:0}}
                                value={currentLang}
                                onChange={(e) => setLang(e.target.value as Lang)}
                            >
                                <option value="zh">简体中文</option>
                                <option value="en">English</option>
                            </select>
                        </Row>
                        <Row label={t("st_bg")} theme={theme}>
                            <input type="color" value={settings.bgColor} onChange={(e) => onUpdate({bgColor: e.target.value})} />
                        </Row>
                        <Row label={t("st_monitor")} theme={theme}>
                             <Checkbox 
                                checked={showStats} 
                                onChange={(val: boolean) => setShowStats(val)} 
                                styles={styles} 
                                theme={theme}
                             />
                        </Row>
                    </Section>

                    <Section title={t("st_viewport")} theme={theme}>
                        <Row label={`${t("st_viewcube_size")} (${settings.viewCubeSize || 100})`} theme={theme}>
                            <Slider min={80} max={300} step={10} 
                                value={settings.viewCubeSize || 100} 
                                onChange={(val: number) => onUpdate({viewCubeSize: val})} 
                                theme={theme}/>
                        </Row>
                        <Row label={t("st_frustum_culling")} theme={theme}>
                             <Checkbox 
                                checked={!!settings.frustumCulling} 
                                onChange={(val: boolean) => onUpdate({frustumCulling: val})} 
                                styles={styles} 
                                theme={theme}
                             />
                        </Row>
                    </Section>

                    <Section title={t("st_lighting")} theme={theme}>
                        <Row label={`${t("st_ambient")} (${settings.ambientInt.toFixed(1)})`} theme={theme}>
                            <Slider min={0} max={5} step={0.1} 
                                value={settings.ambientInt} 
                                onChange={(val: number) => onUpdate({ambientInt: val})} 
                                theme={theme}/>
                        </Row>
                        <Row label={`${t("st_dir")} (${settings.dirInt.toFixed(1)})`} theme={theme}>
                            <Slider min={0} max={5} step={0.1} 
                                value={settings.dirInt} 
                                onChange={(val: number) => onUpdate({dirInt: val})} 
                                theme={theme}/>
                        </Row>
                    </Section>
                </div>
            </div>
        </div>
    );
};
