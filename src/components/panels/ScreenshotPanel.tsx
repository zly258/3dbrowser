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
            closeLabel={t("panel_close") || "关闭"}
            onClose={onClose}
            width={320}
            height={340}
            resizable={false}
            theme={theme}
            storageId="tool_screenshot"
        >
            <div className="ui-toolpanel-body">
                <div className="ui-toolpanel-caption">
                    {t("screenshot_mode") || "截图方式"}:
                </div>

                {options.map((opt) => (
                    <label key={opt.id} className={`ui-choice-card ${mode === opt.id ? 'active' : ''}`}>
                        <input
                            type="radio"
                            name="screenshotMode"
                            checked={mode === opt.id}
                            onChange={() => setMode(opt.id)}
                            className="ui-choice-card-radio"
                        />
                        <div className="ui-choice-card-content">
                            <div className="ui-choice-card-title">{opt.label}</div>
                            <div className="ui-choice-card-desc">{opt.desc}</div>
                        </div>
                    </label>
                ))}

                <Button
                    theme={theme}
                    onClick={() => onCapture(mode)}
                    className="ui-toolpanel-submit"
                >
                    {t("btn_confirm") || "确定"}
                </Button>
            </div>
        </FloatingPanel>
    );
};
