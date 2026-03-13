import React, { useState } from "react";
import { Button } from "../CommonUI";
import { FloatingPanel } from "./FloatingPanel";

interface ExportPanelProps {
    t: any;
    onClose?: () => void;
    onExport: (format: string) => void;
    styles: any;
    theme: any;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ t, onClose, onExport, styles, theme }) => {
    const [format, setFormat] = useState('glb');

    return (
        <FloatingPanel title={t("export_title")} onClose={onClose} width={320} height={400} resizable={false} styles={styles} theme={theme} storageId="tool_export">
            <div style={{ padding: 16 }}>
                <div style={{ marginBottom: 10, fontSize: 12, color: theme.textMuted }}>{t("export_format")}:</div>

                {[
                    { id: 'glb', label: 'GLB', desc: t("export_glb") },
                    { id: 'lmb', label: 'LMB', desc: t("export_lmb") },
                    { id: '3dtiles', label: '3D Tiles', desc: t("export_3dtiles") },
                    { id: 'nbim', label: 'NBIM', desc: t("export_nbim") }
                ].map(opt => (
                    <label key={opt.id} style={{
                        display: 'flex', alignItems: 'center', padding: '10px', cursor: 'pointer',
                        border: `1px solid ${format === opt.id ? theme.accent : theme.border}`,
                        borderRadius: 0, marginBottom: 8,
                        backgroundColor: format === opt.id ? `${theme.accent}15` : 'transparent',
                        transition: 'all 0.2s'
                    }}>
                        <input type="radio" name="exportFmt" checked={format === opt.id} onChange={() => setFormat(opt.id)} style={{ marginRight: 10 }} />
                        <div>
                            <div style={{ color: theme.text, fontWeight: 'bold', fontSize: 14 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: theme.textMuted }}>{opt.desc}</div>
                        </div>
                    </label>
                ))}

                <Button
                    styles={styles}
                    theme={theme}
                    onClick={() => onExport(format)}
                    style={{ width: '100%', marginTop: 10, height: 40 }}
                >
                    {t("export_btn")}
                </Button>
            </div>
        </FloatingPanel>
    );
};
