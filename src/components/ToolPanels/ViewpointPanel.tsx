import React, { useState, useEffect } from "react";
import { Button } from "../CommonUI";
import { DEFAULT_FONT } from "../../theme/Styles";
import { FloatingPanel } from "./FloatingPanel";

interface ViewpointPanelProps {
    t: any;
    onClose?: () => void;
    viewpoints: any[];
    onSave: (name: string) => void;
    onUpdateName: (id: string, name: string) => void;
    onLoad: (viewpoint: any) => void;
    onDelete: (id: string) => void;
    styles: any;
    theme: any;
}

export const ViewpointPanel: React.FC<ViewpointPanelProps> = ({
    t, onClose, viewpoints, onSave, onUpdateName, onLoad, onDelete,
    styles, theme
}) => {
    const [newName, setNewName] = useState("");

    useEffect(() => {
        setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
    }, [viewpoints.length, t]);

    const handleSave = () => {
        if (newName.trim()) {
            onSave(newName.trim());
            setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    };

    return (
        <FloatingPanel title={t("viewpoint_title") || "视点管理"} onClose={onClose} width={360} height={450} resizable={true} styles={styles} theme={theme} storageId="tool_viewpoint">
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            style={{
                                flex: 1, height: 28, padding: '0 10px',
                                backgroundColor: theme.bg, color: theme.text,
                                border: `1px solid ${theme.border}`, borderRadius: 3,
                                fontSize: 12, outline: 'none', fontFamily: DEFAULT_FONT,
                                boxSizing: 'border-box', width: '140px'
                            }}
                            placeholder={t("viewpoint_title") || "视点名称"}
                        />
                        <Button styles={styles} theme={theme} onClick={handleSave} style={{ height: 28, padding: '0 12px', minWidth: '60px', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {t("btn_confirm") || "保存"}
                        </Button>
                    </div>
                </div>

                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 4,
                    backgroundColor: theme.bg,
                    padding: '8px',
                    fontSize: '12px',
                    color: theme.textMuted
                }}>
                    {viewpoints.length === 0 ? (
                        <div style={{ textAlign: 'center', color: theme.textMuted, fontSize: 12, padding: '40px 0' }}>
                            {t("viewpoint_empty") || "暂无保存的视点"}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {viewpoints.map((vp: any) => (
                                <div
                                    key={vp.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '8px',
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        backgroundColor: theme.panelBg,
                                        transition: 'all 0.2s'
                                    }}
                                    onClick={() => onLoad(vp)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.itemHover;
                                        e.currentTarget.style.borderColor = theme.accent;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.panelBg;
                                        e.currentTarget.style.borderColor = theme.border;
                                    }}
                                >
                                    <div style={{
                                        width: 96,
                                        height: 72,
                                        backgroundColor: theme.bg,
                                        borderRadius: 3,
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        border: `1px solid ${theme.border}`
                                    }}>
                                        {vp.image ? (
                                            <img
                                                src={vp.image}
                                                alt={vp.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: theme.textMuted,
                                                fontSize: 10
                                            }}>
                                                无图
                                            </div>
                                        )}
                                    </div>

                                    <div style={{
                                        fontSize: '12px',
                                        color: theme.text,
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {vp.name}
                                    </div>

                                    <div
                                        onClick={(e) => { e.stopPropagation(); onDelete(vp.id); }}
                                        style={{
                                            cursor: 'pointer',
                                            color: theme.danger,
                                            opacity: 0.7,
                                            padding: '4px',
                                            borderRadius: 3,
                                            fontSize: '11px',
                                            flexShrink: 0
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            e.currentTarget.style.backgroundColor = `${theme.danger}20`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.opacity = '0.7';
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        删除
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </FloatingPanel>
    );
};
