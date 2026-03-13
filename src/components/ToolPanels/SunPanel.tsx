import React from "react";
import { Slider } from "../CommonUI";
import { FloatingPanel } from "./FloatingPanel";
import { Checkbox } from "./Checkbox";

interface SunPanelProps {
    t: any;
    onClose?: () => void;
    settings: {
        sunEnabled?: boolean;
        sunLatitude?: number;
        sunLongitude?: number;
        sunTime?: number;
        sunShadow?: boolean;
    };
    onUpdate: (settings: any) => void;
    styles: any;
    theme: any;
}

// 将0-48的滑动条值转换为时间显示
const formatTime = (val: number): string => {
    const hours = Math.floor(val / 2);
    const mins = (val % 2) * 30;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// 将时间转换为滑动条值 (0-48)
const timeToSlider = (time: number): number => {
    return Math.round(time * 2);
};

export const SunPanel: React.FC<SunPanelProps> = ({ t, onClose, settings, onUpdate, styles, theme }) => {
    // 时间滑动值：0-48，每格0.5小时
    const timeValue = timeToSlider(settings.sunTime !== undefined ? settings.sunTime : 12);

    return (
        <FloatingPanel title={t("st_sun_simulation") || "光照模拟"} onClose={onClose} width={320} height={350} resizable={false} styles={styles} theme={theme} storageId="tool_sun">
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>

                {/* 启用开关 */}
                <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
                    <Checkbox
                        label={t("st_sun_enabled") || "启用太阳光"}
                        checked={settings.sunEnabled || false}
                        onChange={(val: boolean) => onUpdate({ sunEnabled: val })}
                        styles={styles}
                        theme={theme}
                        style={{ fontWeight: 'bold', fontSize: 13 }}
                    />
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, fontStyle: 'italic' }}>
                        {t("st_sun_info")}
                    </div>
                </div>

                {settings.sunEnabled && (
                    <>
                        {/* 纬度 */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12, color: theme.textMuted }}>
                                <span>{t("st_sun_latitude") || "纬度"}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                        type="number"
                                        min={-90}
                                        max={90}
                                        value={settings.sunLatitude || 0}
                                        onChange={(e) => {
                                            let val = parseFloat(e.target.value);
                                            val = Math.max(-90, Math.min(90, val));
                                            onUpdate({ sunLatitude: val });
                                        }}
                                        style={{
                                            width: 70,
                                            padding: '4px 8px',
                                            fontSize: 12,
                                            backgroundColor: theme.bg,
                                            color: theme.text,
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: 3,
                                            textAlign: 'right',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                    <span style={{ color: theme.accent }}>°</span>
                                </div>
                            </div>
                        </div>

                        {/* 经度 */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12, color: theme.textMuted }}>
                                <span>{t("st_sun_longitude") || "经度"}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                        type="number"
                                        min={-180}
                                        max={180}
                                        value={settings.sunLongitude || 0}
                                        onChange={(e) => {
                                            let val = parseFloat(e.target.value);
                                            val = Math.max(-180, Math.min(180, val));
                                            onUpdate({ sunLongitude: val });
                                        }}
                                        style={{
                                            width: 70,
                                            padding: '4px 8px',
                                            fontSize: 12,
                                            backgroundColor: theme.bg,
                                            color: theme.text,
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: 3,
                                            textAlign: 'right',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                    <span style={{ color: theme.accent }}>°</span>
                                </div>
                            </div>
                        </div>

                        {/* 时间 - 滑动条 */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12, color: theme.textMuted }}>
                                <span>{t("st_sun_time") || "时间"}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', color: theme.accent }}>
                                    <span>{formatTime(timeValue)}</span>
                                </div>
                            </div>
                            <Slider
                                min={0}
                                max={48}
                                step={1}
                                value={timeValue}
                                onChange={(val: number) => {
                                    onUpdate({ sunTime: val / 2 });
                                }}
                                theme={theme}
                            />
                            {/* 刻度标记 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.textMuted, padding: '0 4px', marginTop: 2 }}>
                                <span>0:00</span>
                                <span>6:00</span>
                                <span>12:00</span>
                                <span>18:00</span>
                                <span>24:00</span>
                            </div>
                        </div>

                        {/* 阴影开关 */}
                        <div style={{ marginBottom: 8 }}>
                            <Checkbox
                                label={t("st_sun_shadow") || "显示阴影"}
                                checked={settings.sunShadow || false}
                                onChange={(val: boolean) => onUpdate({ sunShadow: val })}
                                styles={styles}
                                theme={theme}
                                style={{ fontSize: 12 }}
                            />
                        </div>
                    </>
                )}
            </div>
        </FloatingPanel>
    );
};
