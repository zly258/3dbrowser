<<<<<<< HEAD
﻿import React, { useEffect, useMemo, useState } from "react";
=======
import React, { useEffect, useMemo, useRef, useState } from "react";
<<<<<<< HEAD
>>>>>>> 5ad60f3 (refactor(UI组件): 优化多个组件样式和交互逻辑)
import { IconChevronRight, IconChevronDown, IconCopy } from "../theme/Icons";
=======
import { IconChevronRight, IconChevronDown } from "../theme/Icons";
import { ContextMenu } from "./ContextMenu";
>>>>>>> 6f6dfcd (feat(PropertiesPanel): 添加右键菜单功能支持复制操作)
import {
    filterPropertyGroups,
    serializePropertyGroups,
    type PropertyGroups
} from "../viewer/propertyIndex";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: PropertyGroups | null;
    theme?: any;
}

<<<<<<< HEAD
<<<<<<< HEAD
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
=======
=======
type PropertyGroup = NonNullable<PropertyGroups>[number];
type PropertyItem = PropertyGroup["items"][number];

interface ContextMenuState {
    x: number;
    y: number;
    items: Array<{
        label?: string;
        onClick?: () => void;
        disabled?: boolean;
        divider?: boolean;
    }>;
}

>>>>>>> 6f6dfcd (feat(PropertiesPanel): 添加右键菜单功能支持复制操作)
const COPY_TOAST_DURATION = 1200;
const SEARCH_DEBOUNCE_MS = 120;
>>>>>>> 5ad60f3 (refactor(UI组件): 优化多个组件样式和交互逻辑)

async function copyText(text: string): Promise<boolean> {
    if (!text) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
    }

    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);

        return copied;
    } catch {
        return false;
    }
}

function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebounced(value);
        }, delay);

        return () => {
            window.clearTimeout(timer);
        };
    }, [value, delay]);

    return debounced;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    t,
    selectedProps,
    theme
}) => {
    void theme;

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [copiedVisible, setCopiedVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const copyTimerRef = useRef<number | null>(null);

    const debouncedSearchQuery = useDebouncedValue(
        searchQuery.trim(),
        SEARCH_DEBOUNCE_MS
    );

    useEffect(() => {
        return () => {
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        setCollapsed(new Set());
        setSearchQuery("");
        setContextMenu(null);
    }, [selectedProps]);

    const filteredProps = useMemo(() => {
        if (!selectedProps) return null;
        return filterPropertyGroups(selectedProps, debouncedSearchQuery);
    }, [selectedProps, debouncedSearchQuery]);

    useEffect(() => {
        if (!filteredProps || !debouncedSearchQuery) return;

        const matchedGroups = new Set(
            filteredProps.map((group) => group.name)
        );

        setCollapsed((prev) => {
            const next = new Set(prev);
            matchedGroups.forEach((groupName) => next.delete(groupName));
            return next;
        });
    }, [filteredProps, debouncedSearchQuery]);

    const itemCount = useMemo(() => {
        if (!filteredProps) return 0;
        return filteredProps.reduce((sum, group) => sum + group.items.length, 0);
    }, [filteredProps]);

    const groupCount = filteredProps?.length ?? 0;

    const showCopiedToast = () => {
        setCopiedVisible(true);

        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = window.setTimeout(() => {
            setCopiedVisible(false);
            copyTimerRef.current = null;
        }, COPY_TOAST_DURATION);
    };

    const handleCopy = async (text: string) => {
        const success = await copyText(text);

        if (success) {
            showCopiedToast();
        }
    };

    const getGroupText = (group: PropertyGroup) => {
        return [
            `[${group.name}]`,
            ...group.items.map((item) => `${item.key}: ${item.value}`)
        ].join("\n");
    };

    const getItemText = (item: PropertyItem) => {
        return `${item.key}: ${item.value}`;
    };

    const toggleGroup = (groupName: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);

            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }

            return next;
        });
    };

    const expandAll = () => {
        setCollapsed(new Set());
    };

    const collapseAll = () => {
        if (!filteredProps) return;
        setCollapsed(new Set(filteredProps.map((group) => group.name)));
    };

    const clearSearch = () => {
        setSearchQuery("");
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const openPanelContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();

        const items: ContextMenuState["items"] = [
            {
                label: t("expand_all") || "全部展开",
                onClick: expandAll,
                disabled: !filteredProps || filteredProps.length === 0
            },
            {
                label: t("collapse_all") || "全部折叠",
                onClick: collapseAll,
                disabled: !filteredProps || filteredProps.length === 0
            },
            {
                divider: true
            },
            {
                label: t("copy_all_props") || "复制全部",
                onClick: () => {
                    if (selectedProps) {
                        handleCopy(serializePropertyGroups(selectedProps));
                    }
                },
                disabled: !selectedProps
            }
        ];

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            items
        });
    };

    const openGroupContextMenu = (event: React.MouseEvent, group: PropertyGroup) => {
        event.preventDefault();
        event.stopPropagation();

        const isCollapsed = collapsed.has(group.name);

        const items: ContextMenuState["items"] = [
            {
                label: isCollapsed
                    ? t("expand_group") || "展开分组"
                    : t("collapse_group") || "折叠分组",
                onClick: () => toggleGroup(group.name)
            },
            {
                label: t("expand_all") || "全部展开",
                onClick: expandAll
            },
            {
                label: t("collapse_all") || "全部折叠",
                onClick: collapseAll
            },
            {
                divider: true
            },
            {
                label: t("copy_group_props") || "复制分组",
                onClick: () => handleCopy(getGroupText(group))
            },
            {
                label: t("copy_all_props") || "复制全部",
                onClick: () => {
                    if (selectedProps) {
                        handleCopy(serializePropertyGroups(selectedProps));
                    }
                },
                disabled: !selectedProps
            }
        ];

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            items
        });
    };

    const openItemContextMenu = (
        event: React.MouseEvent,
        group: PropertyGroup,
        item: PropertyItem
    ) => {
        event.preventDefault();
        event.stopPropagation();

        const items: ContextMenuState["items"] = [
            {
                label: t("copy_item_props") || "复制单个",
                onClick: () => handleCopy(getItemText(item))
            },
            {
                label: t("copy_prop_key") || "复制属性名",
                onClick: () => handleCopy(item.key)
            },
            {
                label: t("copy_prop_value") || "复制属性值",
                onClick: () => handleCopy(item.value)
            },
            {
                divider: true
            },
            {
                label: t("copy_group_props") || "复制分组",
                onClick: () => handleCopy(getGroupText(group))
            },
            {
                label: t("copy_all_props") || "复制全部",
                onClick: () => {
                    if (selectedProps) {
                        handleCopy(serializePropertyGroups(selectedProps));
                    }
                },
                disabled: !selectedProps
            }
        ];

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            items
        });
    };

    return (
        <div
            className="ui-properties-panel"
            onContextMenu={openPanelContextMenu}
        >
            {selectedProps && (
                <div className="ui-properties-toolbar">
                    <div className="ui-search-input-wrap">
                        <input
                            type="text"
                            placeholder={t("search_props") || "搜索属性"}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="ui-input ui-input-compact"
                        />

                        {searchQuery && (
                            <button
                                type="button"
                                className="ui-search-clear"
                                onClick={clearSearch}
                                title={t("search_clear") || "清空"}
                            >
                                ×
                            </button>
                        )}
                    </div>

                    <div className="ui-properties-subbar">
                        <div className="ui-properties-meta">
<<<<<<< HEAD
                            {(searchQuery ? t("search_results") : t("prop_groups")) + `: ${groupCount}`}
                            <span> 路 </span>
                            {t("prop_items") + `: ${itemCount}`}
=======
                            {(debouncedSearchQuery
                                ? t("search_results") || "搜索结果"
                                : t("prop_groups") || "属性组")}
                            : {groupCount}
                            <span> · </span>
                            {t("prop_items") || "属性项"}: {itemCount}
>>>>>>> 5ad60f3 (refactor(UI组件): 优化多个组件样式和交互逻辑)
                        </div>
                    </div>
                </div>
            )}

            <div className="ui-properties-scroll">
                {filteredProps ? (
                    filteredProps.length === 0 ? (
                        <div className="ui-properties-empty">
                            {t("search_no_results") || "暂无结果"}
                        </div>
                    ) : (
                        filteredProps.map((group) => {
                            const isCollapsed = collapsed.has(group.name);

                            return (
                                <div
                                    key={group.name}
                                    className="ui-prop-group-block"
                                    style={{
                                        margin: isCollapsed ? "4px 0" : "0"
                                    }}
                                >
                                    <div
                                        className={`ui-prop-group${isCollapsed ? " collapsed" : ""}`}
                                        onClick={() => toggleGroup(group.name)}
                                        onContextMenu={(event) => openGroupContextMenu(event, group)}
                                    >
                                        <span className="truncate">
                                            {group.name}
                                        </span>

                                        <div className="ui-prop-group-actions">
                                            <span className="ui-result-item-secondary">
                                                {group.items.length}
                                            </span>

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
                                        group.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className="ui-prop-row"
                                                onContextMenu={(event) =>
                                                    openItemContextMenu(event, group, item)
                                                }
                                            >
                                                <div
                                                    className="ui-prop-key"
                                                    title={`${item.path} (${t("click_to_copy") || "点击复制"})`}
                                                    onDoubleClick={() => handleCopy(item.key)}
                                                >
                                                    {item.key}
                                                </div>

                                                <div
                                                    className="ui-prop-value"
                                                    title={`${item.value}\n${item.path}`}
                                                    onDoubleClick={() => handleCopy(item.value)}
                                                >
                                                    {item.value}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            );
                        })
                    )
                ) : (
                    <div className="ui-properties-empty">
                        {t("no_selection") || "未选择对象"}
                    </div>
                )}
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={closeContextMenu}
                />
            )}

            {copiedVisible && (
                <div className="ui-toast">
                    {t("copied") || "已复制"}
                </div>
            )}
        </div>
    );
};

