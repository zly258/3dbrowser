import React, { useMemo, useState } from "react";
import { IconChevronRight, IconChevronDown, IconCopy } from "../theme/Icons";

type PropertyGroups = Record<string, Record<string, string>>;

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: PropertyGroups | null;
    theme: any;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [copiedText, setCopiedText] = useState<string | null>(null);

    const currentGroups = useMemo<PropertyGroups | null>(() => {
        return selectedProps;
    }, [selectedProps]);

    const toggleGroup = (group: string) => {
        const next = new Set(collapsed);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        setCollapsed(next);
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedText(text);
            setTimeout(() => setCopiedText(null), 1500);
        } catch (e) {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "true");
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                textarea.style.top = "0";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const copied = document.execCommand("copy");
                document.body.removeChild(textarea);
                if (copied) {
                    setCopiedText(text);
                    setTimeout(() => setCopiedText(null), 1500);
                    return;
                }
            } catch {
                // noop
            }
            console.error("Failed to copy", e);
        }
    };

    const serializeGroups = (groups: PropertyGroups) =>
        Object.entries(groups)
            .map(([group, props]) =>
                [`[${group}]`, ...Object.entries(props).map(([key, value]) => `${key}: ${value}`)].join("\n")
            )
            .join("\n\n");

    const filteredProps = useMemo(() => {
        if (!currentGroups || !searchQuery) return currentGroups;

        const query = searchQuery.toLowerCase();
        const result: PropertyGroups = {};

        Object.entries(currentGroups).forEach(([group, props]) => {
            const filteredGroupProps: Record<string, string> = {};
            Object.entries(props).forEach(([k, v]) => {
                if (group.toLowerCase().includes(query) || k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
                    filteredGroupProps[k] = v;
                }
            });

            if (Object.keys(filteredGroupProps).length > 0) {
                result[group] = filteredGroupProps;
            }
        });

        return result;
    }, [currentGroups, searchQuery]);

    const groupCount = filteredProps ? Object.keys(filteredProps).length : 0;
    const itemCount = filteredProps
        ? Object.values(filteredProps).reduce((sum, props) => sum + Object.keys(props).length, 0)
        : 0;

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
            {selectedProps && (
                <div className="ui-properties-toolbar">
                    <div className="ui-search-input-wrap">
                        <input
                            type="text"
                            placeholder={t("search_props")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="ui-input ui-input-compact"
                        />
                    </div>

                    <div className="ui-properties-subbar">
                        <div className="ui-properties-meta">
                            {(searchQuery ? `${t("search_results") || "结果数"}` : `${t("prop_groups") || "分组"}`) + `: ${groupCount}`}
                            <span> · </span>
                            {(t("prop_items") || "条目") + `: ${itemCount}`}
                        </div>

                        <div className="ui-properties-actions">
                            <button
                                className="ui-properties-action"
                                onClick={() => currentGroups && handleCopy(serializeGroups(currentGroups))}
                                disabled={!currentGroups}
                                title={t("copy_all_props") || "复制全部"}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    opacity: currentGroups ? 1 : 0.5,
                                }}
                            >
                                <IconCopy size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {filteredProps ? (
                    Object.entries(filteredProps).map(([group, props]) => (
                        <div key={group}>
                            <div className={`ui-prop-group${collapsed.has(group) ? ' collapsed' : ''}`} onClick={() => toggleGroup(group)}>
                                <span>{group}</span>
                                <div className="ui-prop-group-actions">
                                    <button
                                        className="ui-prop-copy"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopy(
                                                [`[${group}]`, ...Object.entries(props).map(([k, v]) => `${k}: ${v}`)].join("\n")
                                            );
                                        }}
                                        title={t("copy_group_props") || "复制组"}
                                    >
                                        <IconCopy size={12} />
                                    </button>
                                    <span style={{ opacity: 0.6, display: "flex", alignItems: "center", marginLeft: 4 }}>
                                        {collapsed.has(group) ? (
                                            <IconChevronRight width={14} height={14} />
                                        ) : (
                                            <IconChevronDown width={14} height={14} />
                                        )}
                                    </span>
                                </div>
                            </div>
                            {!collapsed.has(group) &&
                                Object.entries(props).map(([k, v]) => (
                                    <div key={k} className="ui-prop-row">
                                        <div
                                            className="ui-prop-key"
                                            title={`${k} (${t("copied") || "点击复制"})`}
                                            onClick={() => handleCopy(k)}
                                            style={{ cursor: "copy" }}
                                        >
                                            {k}
                                        </div>
                                        <div
                                            className="ui-prop-value"
                                            title={String(v)}
                                            onClick={() => handleCopy(String(v))}
                                            style={{ cursor: "copy" }}
                                        >
                                            {String(v)}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ))
                ) : (
                    <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>{t("no_selection")}</div>
                )}
            </div>
            {copiedText && (
                <div
                    style={{
                        position: "absolute",
                        bottom: "20px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.7)",
                        color: "white",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        zIndex: 100,
                        pointerEvents: "none"
                    }}
                >
                    {t("copied") || "已复制"}
                </div>
            )}
        </div>
    );
};
