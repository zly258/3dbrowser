import React, { useMemo } from "react";
import { IconClose } from "../../theme/Icons";
import { Button, PanelSection } from "../CommonUI";
import { FloatingPanel } from "./FloatingPanel";

interface MeasurePanelProps {
    t: any;
    sceneMgr: any;
    measureType: any;
    setMeasureType: any;
    measureHistory: any[];
    onDelete: (id: string) => void;
    onClear: () => void;
    onClose?: () => void;
    styles: any;
    theme: any;
    highlightedId?: string;
    onHighlight?: (id: string) => void;
}

export const MeasurePanel: React.FC<MeasurePanelProps> = ({
    t, sceneMgr, measureType, setMeasureType,
    measureHistory, onDelete, onClear, onClose,
    styles, theme, highlightedId, onHighlight
}) => {
    const groupedHistory = useMemo(() => {
        const groups: Record<string, any[]> = {
            'dist': [],
            'angle': [],
            'coord': []
        };
        measureHistory.forEach((item: any) => {
            if (groups[item.type]) groups[item.type].push(item);
        });
        return groups;
    }, [measureHistory]);

    const renderMeasureItem = (item: any) => (
        <div
            key={item.id}
            style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, fontSize: 12,
                backgroundColor: highlightedId === item.id ? `${theme.accent}15` : 'transparent',
                borderLeft: highlightedId === item.id ? `4px solid ${theme.accent}` : '4px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
            }}
            onClick={() => onHighlight && onHighlight(item.id)}
        >
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: 8, overflow: 'hidden' }}>
                <span style={{
                    color: highlightedId === item.id ? theme.accent : theme.text,
                    fontFamily: 'monospace',
                    fontWeight: highlightedId === item.id ? 'bold' : 'normal',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>{item.val}</span>
            </div>
            <div
                style={{ cursor: 'pointer', opacity: 0.7, color: theme.danger, padding: 4, borderRadius: 4 }}
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            >
                <IconClose width={16} height={16} />
            </div>
        </div>
    );

    const handleTypeChange = (type: string) => {
        setMeasureType(type);
        sceneMgr?.startMeasurement(type);
    };

    return (
        <FloatingPanel title={t("measure_title")} onClose={onClose} width={340} height={580} resizable={true} styles={styles} theme={theme} storageId="tool_measure">
            <div style={{ padding: '12px 12px 0 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <PanelSection title={t("measure_type")} theme={theme}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-start' }}>
                        <Button styles={styles} theme={theme} active={measureType === 'none'} onClick={() => handleTypeChange('none')} style={{ width: 70, flex: '0 0 auto', height: 28, fontSize: 11, padding: '4px 0' }}>
                            {t("measure_none")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'dist'} onClick={() => handleTypeChange('dist')} style={{ width: 70, flex: '0 0 auto', height: 28, fontSize: 11, padding: '4px 0' }}>
                            {t("measure_dist")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'angle'} onClick={() => handleTypeChange('angle')} style={{ width: 70, flex: '0 0 auto', height: 28, fontSize: 11, padding: '4px 0' }}>
                            {t("measure_angle")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'coord'} onClick={() => handleTypeChange('coord')} style={{ width: 70, flex: '0 0 auto', height: 28, fontSize: 11, padding: '4px 0' }}>
                            {t("measure_coord")}
                        </Button>
                    </div>
                </PanelSection>

                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8, minHeight: 24, padding: '0 4px', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                    {measureType === 'dist' && t("measure_instruct_dist")}
                    {measureType === 'angle' && t("measure_instruct_angle")}
                    {measureType === 'coord' && t("measure_instruct_coord")}
                    {measureType !== 'none' && <span style={{ marginLeft: 'auto', color: theme.accent, fontWeight: 'bold', fontSize: 12 }}>[ESC]退出</span>}
                </div>

                <div style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 4,
                    backgroundColor: theme.bg,
                    flex: 1,
                    overflowY: 'auto',
                    marginBottom: 12
                }}>
                    {measureHistory.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 12 }}>
                            {t("no_measurements")}
                        </div>
                    ) : (
                        (Object.entries(groupedHistory) as [string, any[]][]).map(([type, items]) => {
                            if (items.length === 0) return null;
                            return (
                                <div key={type}>
                                    <div style={{
                                        padding: '4px 10px',
                                        backgroundColor: theme.highlight,
                                        fontSize: 12,
                                        fontWeight: 'bold',
                                        color: theme.accent,
                                        textTransform: 'uppercase',
                                        borderBottom: `1px solid ${theme.border}`
                                    }}>
                                        {type === 'dist' ? t("measure_dist") : type === 'angle' ? t("measure_angle") : t("measure_coord")}
                                    </div>
                                    {items.map(renderMeasureItem)}
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={{ padding: '8px 0', borderTop: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'flex-end', backgroundColor: theme.bg }}>
                    <Button
                        variant="danger"
                        styles={styles}
                        theme={theme}
                        onClick={onClear}
                        disabled={measureHistory.length === 0}
                        style={{ width: 70, flex: '0 0 auto', height: 28, fontSize: 11, padding: '4px 0' }}
                    >
                        {t("measure_clear")}
                    </Button>
                </div>
            </div>
        </FloatingPanel>
    );
};
