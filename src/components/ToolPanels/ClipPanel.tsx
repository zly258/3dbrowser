import React from "react";
import { DualSlider } from "../CommonUI";
import { FloatingPanel } from "./FloatingPanel";
import { Checkbox } from "./Checkbox";

interface ClipPanelProps {
    t: any;
    onClose?: () => void;
    sceneMgr?: any;
    clipEnabled: boolean;
    setClipEnabled: any;
    clipValues: any;
    setClipValues: any;
    clipActive: any;
    setClipActive: any;
    styles: any;
    theme: any;
}

export const ClipPanel: React.FC<ClipPanelProps> = ({
    t, onClose, clipEnabled, setClipEnabled,
    clipValues, setClipValues, clipActive, setClipActive,
    styles, theme
}) => {
    const SliderRow = ({ axis }: { axis: 'x' | 'y' | 'z' }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Checkbox
                checked={clipActive[axis]}
                onChange={(v: boolean) => setClipActive({ ...clipActive, [axis]: v })}
                styles={styles}
                style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1, padding: '0 4px' }}>
                <DualSlider
                    min={0} max={100}
                    value={clipValues[axis]}
                    onChange={(val: [number, number]) => setClipValues({ ...clipValues, [axis]: val })}
                    theme={theme}
                    disabled={!clipActive[axis]}
                />
            </div>
            <span style={{
                fontSize: 10,
                color: theme.accent,
                opacity: clipActive[axis] ? 1 : 0.5,
                fontFamily: 'monospace',
                minWidth: '40px',
                textAlign: 'right'
            }}>
                {Math.round(clipValues[axis][0])}-{Math.round(clipValues[axis][1])}%
            </span>
        </div>
    );

    return (
        <FloatingPanel title={t("clip_title")} onClose={onClose} width={260} height={220} resizable={false} styles={styles} theme={theme} storageId="tool_clip">
            <div style={{ padding: '12px' }}>
                <div style={{ marginBottom: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 8 }}>
                    <Checkbox
                        label={t("clip_enable")}
                        checked={clipEnabled}
                        onChange={(v: boolean) => setClipEnabled(v)}
                        styles={styles}
                        style={{ fontWeight: 'bold', fontSize: 12 }}
                    />
                </div>
                <div style={{
                    opacity: clipEnabled ? 1 : 0.4,
                    pointerEvents: clipEnabled ? 'auto' : 'none',
                    transition: 'all 0.3s ease'
                }}>
                    <SliderRow axis="x" />
                    <SliderRow axis="y" />
                    <SliderRow axis="z" />
                </div>
            </div>
        </FloatingPanel>
    );
};
