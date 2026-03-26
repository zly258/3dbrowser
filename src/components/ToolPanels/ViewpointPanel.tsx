import React, { useEffect, useState } from "react";
import { Button } from "../common";
import { FloatingPanel } from "./FloatingPanel";

interface ViewpointPanelProps {
    t: any;
    onClose?: () => void;
    viewpoints: any[];
    onSave: (name: string, replaceId?: string) => void;
    onUpdateName: (id: string, name: string) => void;
    onLoad: (viewpoint: any) => void;
    onDelete: (id: string) => void;
    onOverwrite: (id: string) => void;
    theme: any;
}

export const ViewpointPanel: React.FC<ViewpointPanelProps> = ({
    t,
    onClose,
    viewpoints,
    onSave,
    onUpdateName,
    onLoad,
    onDelete,
    onOverwrite,
    theme
}) => {
    const [newName, setNewName] = useState("");
    const [editingNames, setEditingNames] = useState<Record<string, string>>({});

    useEffect(() => {
        setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
    }, [viewpoints.length, t]);

    useEffect(() => {
        setEditingNames(
            viewpoints.reduce((acc: Record<string, string>, vp: any) => {
                acc[vp.id] = vp.name;
                return acc;
            }, {})
        );
    }, [viewpoints]);

    const handleSave = () => {
        const normalized = newName.trim();
        if (!normalized) return;
        onSave(normalized);
        setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
    };

    const handleRenameCommit = (id: string) => {
        const nextName = (editingNames[id] || "").trim();
        if (!nextName) {
            setEditingNames((prev) => ({
                ...prev,
                [id]: viewpoints.find((vp: any) => vp.id === id)?.name || ""
            }));
            return;
        }
        onUpdateName(id, nextName);
    };

    return (
        <FloatingPanel
            title={t("viewpoint_title") || "视点管理"}
            onClose={onClose}
            width={380}
            height={470}
            resizable={true}
            theme={theme}
            storageId="tool_viewpoint"
        >
            <div className="ui-panel-stack" style={{ height: "100%" }}>
                <div className="ui-panel-section">
                    <div className="ui-form-row ui-form-row-top">
                        <div className="ui-form-value ui-form-value-stretch">
                            <div className="ui-inline-actions">
                                <input
                                    autoFocus
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSave();
                                    }}
                                    className="ui-input"
                                    placeholder={t("viewpoint_title") || "视点名称"}
                                />
                                <Button variant="primary" onClick={handleSave}>
                                    {t("btn_confirm") || "保存"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ui-panel-section ui-panel-section-fill">
                    {viewpoints.length === 0 ? (
                        <div className="ui-empty-state">
                            {t("viewpoint_empty") || "暂无保存的视点"}
                        </div>
                    ) : (
                        <div className="ui-viewpoint-list">
                            {viewpoints.map((vp: any) => (
                                <div key={vp.id} className="ui-viewpoint-card">
                                    <button
                                        className="ui-viewpoint-preview"
                                        onClick={() => onLoad(vp)}
                                        title={t("viewpoint_load") || "恢复视点"}
                                    >
                                        {vp.image ? (
                                            <img
                                                src={vp.image}
                                                alt={vp.name}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            <div className="ui-empty-state" style={{ minHeight: "100%" }}>
                                                {t("viewpoint_no_preview") || "无预览"}
                                            </div>
                                        )}
                                    </button>

                                    <div className="ui-viewpoint-main">
                                        <input
                                            className="ui-input"
                                            value={editingNames[vp.id] || ""}
                                            onChange={(e) => setEditingNames((prev) => ({
                                                ...prev,
                                                [vp.id]: e.target.value
                                            }))}
                                            onBlur={() => handleRenameCommit(vp.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                        />

                                        <div className="ui-inline-actions ui-inline-actions-wrap">
                                            <Button variant="default" onClick={() => onLoad(vp)}>
                                                {t("viewpoint_load") || "恢复"}
                                            </Button>
                                            <Button variant="ghost" onClick={() => onOverwrite(vp.id)}>
                                                {t("viewpoint_overwrite") || "覆盖"}
                                            </Button>
                                            <Button variant="ghost" onClick={() => onDelete(vp.id)}>
                                                {t("delete_item") || "删除"}
                                            </Button>
                                        </div>
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
