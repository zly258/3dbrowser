

import React from "react";
import { styles, colors } from "../Styles";
import { IconClose } from "../Icons";
import { TFunc, Lang } from "../Locales";
import { SceneSettings } from "../SceneManager";

interface SettingsModalProps {
    t: TFunc;
    onClose: () => void;
    settings: SceneSettings;
    onUpdate: (s: Partial<SceneSettings>) => void;
    currentLang: Lang;
    setLang: (l: Lang) => void;
}

const Section = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div style={{marginBottom: 16}}>
        <div style={{fontSize: 11, fontWeight: 'bold', color: colors.accent, marginBottom: 8, borderBottom:`1px solid #333`, paddingBottom:4}}>
            {title}
        </div>
        {children}
    </div>
);

const Row = ({ label, children }: { label: string, children?: React.ReactNode }) => (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6, fontSize:12}}>
        <span style={{color:'#ccc'}}>{label}</span>
        <div style={{flex:1, display:'flex', justifyContent:'flex-end', marginLeft: 10}}>
            {children}
        </div>
    </div>
);

export const SettingsPanel: React.FC<SettingsModalProps> = ({ t, onClose, settings, onUpdate, currentLang, setLang }) => {
    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <div style={styles.floatingHeader}>
                    <span>{t("settings")}</span>
                    <div onClick={onClose} style={{ cursor: 'pointer' }}><IconClose /></div>
                </div>
                
                <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
                    <Section title={t("setting_general")}>
                        <Row label={t("st_lang")}>
                            <select 
                                style={{background:'#333', color:'#fff', border:'1px solid #555', padding:2, borderRadius:2}}
                                value={currentLang}
                                onChange={(e) => setLang(e.target.value as Lang)}
                            >
                                <option value="zh">中文 (Chinese)</option>
                                <option value="en">English</option>
                            </select>
                        </Row>
                        <Row label={t("st_bg")}>
                            <input type="color" value={settings.bgColor} onChange={(e) => onUpdate({bgColor: e.target.value})} />
                        </Row>
                    </Section>

                    <Section title={t("st_lighting")}>
                        <Row label={`${t("st_ambient")} (${settings.ambientInt.toFixed(1)})`}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.ambientInt} 
                                onChange={(e) => onUpdate({ambientInt: parseFloat(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                        <Row label={`${t("st_dir")} (${settings.dirInt.toFixed(1)})`}>
                            <input type="range" min="0" max="5" step="0.1" 
                                value={settings.dirInt} 
                                onChange={(e) => onUpdate({dirInt: parseFloat(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                    </Section>

                    {/* Display Section removed as visible edges is removed */}

                    <Section title={t("st_opt")}>
                        <Row label={t("st_opt_progressive")}>
                            <input type="checkbox" checked={settings.progressive} onChange={(e) => onUpdate({progressive: e.target.checked})} />
                        </Row>
                        {settings.progressive && (
                            <>
                                <Row label={`${t("st_opt_ratio")} (${Math.round(settings.hideRatio * 100)}%)`}>
                                    <input type="range" min="0.1" max="0.9" step="0.1" 
                                        value={settings.hideRatio} 
                                        onChange={(e) => onUpdate({hideRatio: parseFloat(e.target.value)})} 
                                        style={{width: 100}}/>
                                </Row>
                                <Row label={t("st_opt_threshold")}>
                                    <input type="number" 
                                        value={settings.progressiveThreshold} 
                                        onChange={(e) => onUpdate({progressiveThreshold: parseInt(e.target.value)})} 
                                        style={{width: 80, background:'#333', color:'white', border:'1px solid #444'}}
                                    />
                                </Row>
                            </>
                        )}
                    </Section>
                    
                    <Section title={t("st_tiles")}>
                        <Row label={`${t("st_sse")} (${settings.sse})`}>
                            <input type="range" min="1" max="50" step="1" 
                                value={settings.sse} 
                                onChange={(e) => onUpdate({sse: parseInt(e.target.value)})} 
                                style={{width: 100}}/>
                        </Row>
                        <Row label={`${t("st_mem")} (${settings.maxMemory} MB)`}>
                            <input type="number" 
                                value={settings.maxMemory} 
                                onChange={(e) => onUpdate({maxMemory: parseInt(e.target.value)})} 
                                style={{width: 60, background:'#333', color:'white', border:'1px solid #444'}}/>
                        </Row>
                    </Section>
                </div>
            </div>
        </div>
    );
};
