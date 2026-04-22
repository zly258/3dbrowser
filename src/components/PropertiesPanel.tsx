import React, { useEffect, useMemo, useState } from "react";
import { IconChevronRight, IconChevronDown, IconCopy } from "../theme/Icons";
import { filterPropertyGroups, serializePropertyGroups, type PropertyGroups } from "../viewer/propertyIndex";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: PropertyGroups | null;
    theme: any;
}

const PropertyRow = React.memo(({ item, handleCopy, t }: any) => (
    <div className="ui-prop-row">
        <div
            className="ui-prop-key"
            title={`${item.path} (${t("click_to_copy")})`}
            onClick={() => handleCopy(item.key)}
        >
            {item.key}
        </div>
        <div
            className="ui-prop-value"
            title={`${item.value}\n${item.path}`}
            onClick={() => handleCopy(item.value)}
        >
            {item.value}
        </div>
    </div>
));

const PropertyGroup = React.memo(({ group, isCollapsed, toggleGroup, handleCopy, t }: any) => (
    <div>
        <div className={`ui-prop-group${isCollapsed ? ' collapsed' : ''}`} onClick={() => toggleGroup(group.name)}>
            <span>{group.name}</span>
            <div className="ui-prop-group-actions">
                <button
                    className="ui-prop-copy"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleCopy([`[${group.name}]`, ...group.items.map((item: any) => `${item.key}: ${item.value}`)].join("\n"));
                    }}
                    title={t("copy_group_props")}
                >
                    <IconCopy size={12} />
                </button>
                <span className="ui-prop-group-chevron">
                    {isCollapsed ? (
                        <IconChevronRight width={14} height={14} />
                    ) : (
                        <IconChevronDown width={14} height={14} />
                    )}
                </span>
            </div>
        </div>
        {!isCollapsed &&
            group.items.map((item: any) => (
                <PropertyRow key={item.id} item={item} handleCopy={handleCopy} t={t} />
            ))}
    </div>
));

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

    const filteredProps = useMemo(() => {
        if (!currentGroups) return null;
        return filterPropertyGroups(currentGroups, searchQuery);
    }, [currentGroups, searchQuery]);

    useEffect(() => {
        if (!filteredProps || !searchQuery) return;
        const matchedGroups = new Set(filteredProps.map((group) => group.name));
        setCollapsed((prev) => {
            const next = new Set(prev);
            matchedGroups.forEach((groupName) => next.delete(groupName));
            return next;
        });
    }, [filteredProps, searchQuery]);

    const groupCount = filteredProps ? filteredProps.length : 0;
    const itemCount = filteredProps
        ? filteredProps.reduce((sum, group) => sum + group.items.length, 0)
        : 0;

    return (
        <div className="ui-properties-panel">
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
                            {(searchQuery ? t("search_results") : t("prop_groups")) + `: ${groupCount}`}
                            <span> 路 </span>
                            {t("prop_items") + `: ${itemCount}`}
                        </div>

                        <div className="ui-properties-actions">
                            <button
                                className="ui-properties-action ui-properties-icon-btn"
                                onClick={() => currentGroups && handleCopy(serializePropertyGroups(currentGroups))}
                                disabled={!currentGroups}
                                title={t("copy_all_props")}
                            >
                                <IconCopy size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="ui-properties-scroll">
                {filteredProps ? (
                    filteredProps.map((group) => (
                        <div key={group.name}>
                            <div className={`ui-prop-group${collapsed.has(group.name) ? ' collapsed' : ''}`} onClick={() => toggleGroup(group.name)}>
                                <span>{group.name}</span>
                                <div className="ui-prop-group-actions">
                                    <button
                                        className="ui-prop-copy"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopy([`[${group.name}]`, ...group.items.map((item) => `${item.key}: ${item.value}`)].join("\n"));
                                        }}
                                        title={t("copy_group_props")}
                                    >
                                        <IconCopy size={12} />
                                    </button>
                                    <span className="ui-prop-group-chevron">
                                        {collapsed.has(group.name) ? (
                                            <IconChevronRight width={14} height={14} />
                                        ) : (
                                            <IconChevronDown width={14} height={14} />
                                        )}
                                    </span>
                                </div>
                            </div>
                            {!collapsed.has(group.name) &&
                                group.items.map((item) => (
                                    <div key={item.id} className="ui-prop-row">
                                        <div
                                            className="ui-prop-key"
                                            title={`${item.path} (${t("click_to_copy")})`}
                                            onClick={() => handleCopy(item.key)}
                                        >
                                            {item.key}
                                        </div>
                                        <div
                                            className="ui-prop-value"
                                            title={`${item.value}\n${item.path}`}
                                            onClick={() => handleCopy(item.value)}
                                        >
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ))
                ) : (
                    <div className="ui-properties-empty">
                        {t("no_selection")}
                    </div>
                )}
            </div>
            {copiedText && (
                <div className="ui-copy-toast">
                    {t("copied")}
                </div>
            )}
        </div>
    );
};

