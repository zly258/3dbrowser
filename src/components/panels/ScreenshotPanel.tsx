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
            label: t("op_screenshot"),
            desc: t("screenshot_scene_desc")
        },
        {
            id: 'transparent' as const,
            label: t("op_screenshot_transparent"),
            desc: t("screenshot_transparent_desc")
        }
    ];

    return (
        <FloatingPanel
            title={t("op_screenshot")}
            closeLabel={t("panel_close")}
            onClose={onClose}
            width={300}
            resizable={false}
            autoHeight={true}
            theme={theme}
            storageId="tool_screenshot"
        >
            <div className="ui-toolpanel-body ui-screenshot-panel-body">
                <div className="ui-toolpanel-caption">
                    {t("screenshot_mode")}:
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
                    variant="primary"
                    onClick={() => onCapture(mode)}
                    className="ui-toolpanel-submit"
                >
                    {t("btn_confirm")}
                </Button>
            </div>
        </FloatingPanel>
    );
};
