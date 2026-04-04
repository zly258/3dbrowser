import React, { useState } from "react";
import { Button } from "../common/Button";
import { FloatingPanel } from "./FloatingPanel";

interface ScreenshotPanelProps {
    t: any;
    onClose?: () => void;
    onCapture: (mode: 'scene' | 'transparent') => void;
    theme: any;
}

export const ScreenshotPanel: React.FC<ScreenshotPanelProps> = ({ t, onClose, onCapture, theme }) => {
    const [mode, setMode] = useState<'scene' | 'transparent'>('scene');

    const options = [
        {
            id: 'scene' as const,
            label: t("op_screenshot") || '场景截图',
            desc: t("screenshot_scene_desc") || '保留当前背景色和界面里的场景效果'
        },
        {
            id: 'transparent' as const,
            label: t("op_screenshot_transparent") || '透明背景截图',
            desc: t("screenshot_transparent_desc") || '导出透明背景 PNG，便于汇报和排版'
        }
    ];

    return (
        <FloatingPanel
            title={t("op_screenshot") || "场景截图"}
            onClose={onClose}
            width={320}
            height={280}
            resizable={false}
            theme={theme}
            storageId="tool_screenshot"
        >
            <div style={{ padding: 16 }}>
                <div style={{ marginBottom: 10, fontSize: 12, color: theme.textMuted }}>
                    {t("screenshot_mode") || "截图方式"}:
                </div>

                {options.map((opt) => (
                    <label
                        key={opt.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px',
                            cursor: 'pointer',
                            border: `1px solid ${mode === opt.id ? theme.accent : theme.border}`,
                            borderRadius: 0,
                            marginBottom: 8,
                            backgroundColor: mode === opt.id ? `${theme.accent}15` : 'transparent',
                            transition: 'all 0.2s'
                        }}
                    >
                        <input
                            type="radio"
                            name="screenshotMode"
                            checked={mode === opt.id}
                            onChange={() => setMode(opt.id)}
                            style={{ marginRight: 10 }}
                        />
                        <div>
                            <div style={{ color: theme.text, fontWeight: 'bold', fontSize: 14 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: theme.textMuted }}>{opt.desc}</div>
                        </div>
                    </label>
                ))}

                <Button
                    theme={theme}
                    onClick={() => onCapture(mode)}
                    style={{ width: '100%', marginTop: 10, height: 40 }}
                >
                    {t("btn_confirm") || "确定"}
                </Button>
            </div>
        </FloatingPanel>
    );
};
