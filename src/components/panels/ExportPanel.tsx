import React, { useEffect, useState } from "react";
import { Button } from "../common/Button";
import { FloatingPanel } from "./FloatingPanel";

interface ExportPanelProps {
    t: any;
    onClose?: () => void;
    onExport: (format: string, fileName: string) => void;
    getDefaultFileName: (format: string) => string;
    theme: any;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ t, onClose, onExport, getDefaultFileName, theme }) => {
    const [format, setFormat] = useState('glb');
    const [fileName, setFileName] = useState(() => getDefaultFileName('glb'));

    useEffect(() => {
        setFileName(getDefaultFileName(format));
    }, [format, getDefaultFileName]);

    return (
        <FloatingPanel title={t("export_title")} closeLabel={t("panel_close")} onClose={onClose} width={300} autoHeight={true} resizable={false} theme={theme} storageId="tool_export">
            <div className="ui-toolpanel-body ui-export-panel-body">
                <div className="ui-toolpanel-caption">{t("export_format")}:</div>

                {[
                    { id: 'glb', label: 'GLB', desc: t("export_glb") },
                    { id: 'nbim', label: 'NBIM', desc: t("export_nbim") }
                ].map(opt => (
                    <label key={opt.id} className={`ui-choice-card ${format === opt.id ? 'active' : ''}`}>
                        <input
                            type="radio"
                            name="exportFmt"
                            checked={format === opt.id}
                            onChange={() => setFormat(opt.id)}
                            className="ui-choice-card-radio"
                        />
                        <div className="ui-choice-card-content">
                            <div className="ui-choice-card-title">{opt.label}</div>
                            <div className="ui-choice-card-desc">{opt.desc}</div>
                        </div>
                    </label>
                ))}

                <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">
                    {t("export_filename")}:
                </div>
                <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder={t("export_filename_placeholder")}
                    className="ui-input ui-input-compact"
                />
                <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">
                    {t("export_filename_hint")}
                </div>

                <Button
                    theme={theme}
                    variant="primary"
                    onClick={() => onExport(format, fileName)}
                    className="ui-toolpanel-submit"
                >
                    {t("export_btn")}
                </Button>
            </div>
        </FloatingPanel>
    );
};
