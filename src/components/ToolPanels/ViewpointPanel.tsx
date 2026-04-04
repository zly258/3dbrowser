import React, { useEffect, useState } from "react";
import { Button } from "../common";
import { FloatingPanel } from "./FloatingPanel";
import { IconTrash2 } from "../../theme/Icons";
import type { ViewpointRecord } from "../../viewer/types";

interface ViewpointPanelProps {
    t: any;
    onClose?: () => void;
    viewpoints: ViewpointRecord[];
    onSave: (name: string, replaceId?: string) => void;
    onUpdateName: (id: string, name: string) => void;
    onLoad: (viewpoint: ViewpointRecord) => void;
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
    theme
}) => {
    const [newName, setNewName] = useState("");
    const [editingNames, setEditingNames] = useState<Record<string, string>>({});

    useEffect(() => {
        setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
    }, [viewpoints.length, t]);

    useEffect(() => {
        setEditingNames(
            viewpoints.reduce((acc: Record<string, string>, vp) => {
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
                [id]: viewpoints.find((vp) => vp.id === id)?.name || ""
            }));
            return;
        }
        onUpdateName(id, nextName);
    };

    return (
        <FloatingPanel
            title={t("viewpoint_title") || "视点管理"}
            onClose={onClose}
            width={320}
            height={470}
            resizable={true}
            theme={theme}
            storageId="tool_viewpoint"
        >
            <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
                {/* 新建视点输入 */}
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
                        style={{ flex: 1 }}
                    />
                    <Button variant="primary" onClick={handleSave}>
                        {t("btn_confirm") || "保存"}
                    </Button>
                </div>

                {/* 视点网格列表 */}
                <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                    {viewpoints.length === 0 ? (
                        <div className="ui-empty-state">
                            {t("viewpoint_empty") || "暂无保存的视点"}
                        </div>
                    ) : (
                        <div className="ui-viewpoint-grid">
                            {viewpoints.map((vp) => (
                                <div key={vp.id} className="ui-viewpoint-card-v2">
                                    {/* 图片区域 */}
                                    <div
                                        className="ui-viewpoint-image"
                                        onDoubleClick={() => onLoad(vp)}
                                        title={t("viewpoint_load") || "双击恢复视点"}
                                    >
                                        {vp.image ? (
                                            <img
                                                src={vp.image}
                                                alt={vp.name}
                                            />
                                        ) : (
                                            <div className="ui-viewpoint-no-preview">
                                                {t("viewpoint_no_preview") || "无预览"}
                                            </div>
                                        )}
                                        {/* 删除按钮 */}
                                        <button
                                            className="ui-viewpoint-delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(vp.id);
                                            }}
                                            title={t("delete_item") || "删除"}
                                        >
                                            <IconTrash2 size={12} />
                                        </button>
                                    </div>
                                    {/* 名称区域 */}
                                    <input
                                        className="ui-viewpoint-name"
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
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </FloatingPanel>
    );
};
