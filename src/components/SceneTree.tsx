import React, { useMemo, useState, useRef, useEffect } from "react";
import { IconChevronRight, IconChevronDown, IconClose } from "../theme/Icons";
import { Checkbox } from "./common";
import { ContextMenu } from "./ContextMenu";

interface TreeNode {
    uuid: string;
    name: string;
    type: "GROUP" | "MESH" | "TILES";
    depth: number;
    children: TreeNode[];
    expanded: boolean;
    visible: boolean;
    object: any;
    isFileNode?: boolean;
    isLastChild?: boolean;
    parentIsLast?: boolean[];
}

export const buildTree = (object: any, depth = 0): TreeNode => {
    const isTiles = object.name === "3D Tileset";
    const isMesh = object.isMesh;

    const node: TreeNode = {
        uuid: object.uuid,
        name: object.name || "Unnamed",
        type: isTiles ? "TILES" : isMesh ? "MESH" : "GROUP",
        depth,
        children: [],
        expanded: false,
        visible: object.visible !== false,
        object
    };

    if (object.children && object.children.length > 0) {
        const children = object.children.filter((c: any) => {
            if (c.name === "Helpers" || c.name === "Measure") return false;
            if (c.userData && c.userData.isOptimizedGroup) return false;
            return true;
        });

        node.children = children.map((c: any, index: number) => {
            const childNode = buildTree(c, depth + 1);
            childNode.isLastChild = index === children.length - 1;
            return childNode;
        });
    }

    return node;
};

const flattenTree = (nodes: TreeNode[], result: TreeNode[] = [], parentIsLast: boolean[] = []) => {
    if (!nodes) return result;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.isLastChild = i === nodes.length - 1;
        node.parentIsLast = [...parentIsLast];
        result.push(node);
        if (node.expanded && node.children && node.children.length > 0) {
            flattenTree(node.children, result, [...parentIsLast, node.isLastChild]);
        }
    }
    return result;
};

const collectExpandedState = (nodes: TreeNode[]) => {
    const map = new Map<string, boolean>();
    const walk = (list: TreeNode[]) => {
        list.forEach((node) => {
            map.set(node.uuid, node.expanded);
            if (node.children.length > 0) walk(node.children);
        });
    };
    walk(nodes);
    return map;
};

const applyExpandedState = (nodes: TreeNode[], expandedMap: Map<string, boolean>) =>
    nodes.map((node) => ({
        ...node,
        expanded: expandedMap.get(node.uuid) ?? node.expanded,
        children: applyExpandedState(node.children, expandedMap)
    }));

const expandPathToUuid = (nodes: TreeNode[], targetUuid: string): [TreeNode[], boolean] => {
    let found = false;
    const nextNodes = nodes.map((node) => {
        const [children, childFound] = expandPathToUuid(node.children, targetUuid);
        const isSelf = node.uuid === targetUuid;
        const isFound = isSelf || childFound;
        if (isFound) found = true;
        return {
            ...node,
            expanded: childFound ? true : node.expanded,
            children
        };
    });
    return [nextNodes, found];
};

interface SceneTreeProps {
    t: (key: string) => string;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onDelete?: (obj: any) => void;
    onFocus?: (obj: any) => void;
    onIsolate?: (uuid: string) => void;
    onHide?: (uuid: string) => void;
    onShowAll?: () => void;
}

export const SceneTree: React.FC<SceneTreeProps> = ({
    t,
    treeRoot,
    setTreeRoot,
    selectedUuid,
    onSelect,
    onToggleVisibility,
    onDelete,
    onFocus,
    onIsolate,
    onHide,
    onShowAll
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(400);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchExpandedStateRef = useRef<Map<string, boolean> | null>(null);
    const previousSearchQueryRef = useRef("");

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => setContainerHeight(entry.contentRect.height));
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const prevQuery = previousSearchQueryRef.current;
        if (!prevQuery && searchQuery) {
            searchExpandedStateRef.current = collectExpandedState(treeRoot);
        }
        if (prevQuery && !searchQuery && searchExpandedStateRef.current) {
            const snapshot = searchExpandedStateRef.current;
            setTreeRoot((prev) => applyExpandedState(prev, snapshot));
            searchExpandedStateRef.current = null;
        }
        previousSearchQueryRef.current = searchQuery;
    }, [searchQuery, setTreeRoot, treeRoot]);

    useEffect(() => {
        if (!selectedUuid) return;
        setTreeRoot((prev) => {
            const [nextTree, found] = expandPathToUuid(prev, selectedUuid);
            return found ? nextTree : prev;
        });
    }, [selectedUuid, setTreeRoot]);

    const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
        if (!query) return nodes;
        const lowercaseQuery = query.toLowerCase();
        return nodes.reduce((acc: TreeNode[], node) => {
            const matches = node.name.toLowerCase().includes(lowercaseQuery);
            const filteredChildren = filterTree(node.children, query);
            if (matches || filteredChildren.length > 0) {
                acc.push({
                    ...node,
                    expanded: true,
                    children: filteredChildren
                });
            }
            return acc;
        }, []);
    };

    const filteredTree = useMemo(() => filterTree(treeRoot, searchQuery), [treeRoot, searchQuery]);
    const flatData = useMemo(() => flattenTree(filteredTree), [filteredTree]);
    const resultCount = flatData.length;
    const rowHeight = 24;
    const totalHeight = flatData.length * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const endIndex = Math.min(flatData.length, startIndex + visibleCount + 1);
    const visibleItems = flatData.slice(startIndex, endIndex);

    useEffect(() => {
        if (!selectedUuid || !containerRef.current) return;
        const targetIndex = flatData.findIndex((node) => node.uuid === selectedUuid);
        if (targetIndex < 0) return;

        const currentTop = containerRef.current.scrollTop;
        const currentBottom = currentTop + containerHeight;
        const itemTop = targetIndex * rowHeight;
        const itemBottom = itemTop + rowHeight;

        if (itemTop < currentTop) {
            containerRef.current.scrollTop = itemTop;
        } else if (itemBottom > currentBottom) {
            containerRef.current.scrollTop = Math.max(0, itemBottom - containerHeight);
        }
    }, [selectedUuid, flatData, containerHeight, rowHeight]);

    const toggleNode = (nodeUuid: string) => {
        const toggle = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => {
                if (node.uuid === nodeUuid) return { ...node, expanded: !node.expanded };
                if (node.children.length > 0) return { ...node, children: toggle(node.children) };
                return node;
            });
        setTreeRoot((prev) => toggle(prev));
    };

    const expandAll = () => {
        const expand = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => ({
                ...node,
                expanded: node.children.length > 0,
                children: expand(node.children)
            }));
        setTreeRoot((prev) => expand(prev));
    };

    const collapseAll = () => {
        const collapse = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => ({
                ...node,
                expanded: false,
                children: collapse(node.children)
            }));
        setTreeRoot((prev) => collapse(prev));
    };

    return (
        <div className="ui-tree-panel">
            <div className="ui-search-bar">
                <div className="ui-search-input-wrap">
                    <input
                        type="text"
                        placeholder={t("search_nodes")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="ui-input ui-input-compact"
                    />
                    {searchQuery && (
                        <button className="ui-search-clear" onClick={() => setSearchQuery("")}>
                            <IconClose width={14} height={14} />
                        </button>
                    )}
                </div>
                <div className="ui-search-meta">
                    {searchQuery
                        ? `${t("search_results") || "结果"}: ${resultCount}`
                        : `${t("selected_count") || "已选择"}: ${selectedUuid ? 1 : 0}`}
                </div>
            </div>

            <div
                ref={containerRef}
                className="ui-tree-container flex-1 overflow-y-auto overflow-x-hidden"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
                <div style={{ height: totalHeight, position: "relative" }}>
                    <div style={{ position: "absolute", top: startIndex * rowHeight, left: 0, right: 0 }}>
                        {visibleItems.map((node) => (
                            <div
                                key={node.uuid}
                                className={`ui-tree-node ${node.uuid === selectedUuid ? "selected" : ""}`}
                                style={{ paddingLeft: 8 }}
                                onClick={() => onSelect(node.uuid, node.object)}
                                onDoubleClick={() => onFocus?.(node.object)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, node });
                                }}
                            >
                                {node.depth > 0 && (
                                    <div style={{ display: "flex", height: "100%", alignItems: "center", flexShrink: 0 }}>
                                        {node.parentIsLast?.map((isLast, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    width: 12,
                                                    height: "100%",
                                                    position: "relative",
                                                    borderLeft: isLast ? "none" : "1px solid var(--border-color)"
                                                }}
                                            />
                                        ))}
                                        <div
                                            style={{
                                                width: 12,
                                                height: "100%",
                                                position: "relative",
                                                display: "flex",
                                                alignItems: "center"
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    top: 0,
                                                    bottom: node.isLastChild ? "50%" : 0,
                                                    borderLeft: "1px solid var(--border-color)"
                                                }}
                                            />
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    width: 10,
                                                    borderTop: "1px solid var(--border-color)"
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div
                                    className="ui-tree-expander"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleNode(node.uuid);
                                    }}
                                >
                                    {node.children.length > 0 ? (
                                        node.expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
                                    ) : null}
                                </div>

                                <Checkbox
                                    checked={node.visible}
                                    onChange={(val: boolean) => onToggleVisibility(node.uuid, val)}
                                    style={{ marginRight: 4, padding: 0, flexShrink: 0 }}
                                />

                                <div className="ui-tree-label">
                                    {searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                                        <span>
                                            {node.name.split(new RegExp(`(${searchQuery})`, "gi")).map((part, index) =>
                                                part.toLowerCase() === searchQuery.toLowerCase() ? (
                                                    <span key={index} className="ui-search-hit">
                                                        {part}
                                                    </span>
                                                ) : (
                                                    part
                                                )
                                            )}
                                        </span>
                                    ) : (
                                        node.name
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            label: t("locate_in_view") || "定位到视图",
                            onClick: () => onFocus?.(contextMenu.node.object)
                        },
                        {
                            label: t("hide_selected") || "隐藏选中",
                            onClick: () => onHide?.(contextMenu.node.uuid)
                        },
                        {
                            label: t("isolate_selection") || "隔离选中",
                            onClick: () => onIsolate?.(contextMenu.node.uuid)
                        },
                        {
                            label: t("show_all") || "显示全部",
                            onClick: () => onShowAll?.()
                        },
                        { divider: true },
                        {
                            label: t("expand_all"),
                            onClick: expandAll
                        },
                        {
                            label: t("collapse_all"),
                            onClick: collapseAll
                        },
                        ...(contextMenu.node.isFileNode
                            ? [
                                  { divider: true },
                                  {
                                      label: t("delete_item"),
                                      onClick: () => onDelete?.(contextMenu.node.object)
                                  }
                              ]
                            : [])
                    ]}
                />
            )}
        </div>
    );
};
