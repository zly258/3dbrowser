import React, { useMemo, useState, useRef, useEffect } from "react";
import { IconChevronRight, IconChevronDown, IconClose } from "../theme/Icons";
import { Button, Checkbox } from "./common";
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
    hasChildren?: boolean;
    childrenLoaded?: boolean;
}

interface IfcMetadata {
    storey?: string;
    elevation?: number;
    systems?: string[];
    category?: string;
    materials?: string[];
    classifications?: string[];
    typeName?: string;
    globalId?: string;
}

const INVALID_LABELS = new Set(["", "n/a", "na", "undefined", "null", "-", "--"]);

const sanitizeTreeLabel = (...candidates: Array<string | null | undefined>) => {
    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const trimmed = candidate.trim();
        if (INVALID_LABELS.has(trimmed.toLowerCase())) continue;
        return trimmed;
    }
    return "";
};

export const buildTree = (object: any, depth = 0): TreeNode => {
    const isTiles = object.name === "3D Tileset";
    const isMesh = object.isMesh;
    const fallbackName = isTiles ? "3D Tileset" : isMesh ? `Mesh_${object.id}` : `Group_${object.id}`;

    const node: TreeNode = {
        uuid: object.uuid,
        name: sanitizeTreeLabel(object.name, object.userData?.name) || fallbackName,
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

const getRawChildren = (node: TreeNode | any): any[] => {
    const children = node?.object?.children ?? node?.children;
    return Array.isArray(children) ? children : [];
};

const createTreeNodeFromRaw = (rawNode: any, depth: number, isFileNode = false): TreeNode => {
    const rawChildren = Array.isArray(rawNode?.children) ? rawNode.children : [];
    const fallbackName = rawNode?.type === "Mesh"
        ? `Mesh_${rawNode?.id ?? "?"}`
        : `Group_${rawNode?.id ?? "?"}`;
    return {
        uuid: rawNode?.id ?? rawNode?.uuid ?? String(Math.random()),
        name: sanitizeTreeLabel(rawNode?.name, rawNode?.userData?.name) || fallbackName,
        type: rawNode?.type === "Mesh" ? "MESH" : "GROUP",
        depth,
        children: [],
        expanded: false,
        visible: rawNode?.visible !== false,
        object: rawNode,
        isFileNode,
        hasChildren: rawChildren.length > 0,
        childrenLoaded: false
    };
};

const ensureNodeChildrenLoaded = (node: TreeNode): TreeNode => {
    if (node.childrenLoaded || !node.hasChildren) return node;
    return {
        ...node,
        childrenLoaded: true,
        children: getRawChildren(node).map((child) => createTreeNodeFromRaw(child, node.depth + 1))
    };
};

const rawTreeContainsUuid = (rawNode: any, targetUuid: string): boolean => {
    if (!rawNode) return false;
    if (rawNode.id === targetUuid || rawNode.uuid === targetUuid) return true;
    const children = Array.isArray(rawNode.children) ? rawNode.children : [];
    return children.some((child) => rawTreeContainsUuid(child, targetUuid));
};

const getNodeSearchText = (node: TreeNode | any) => {
    const source = node?.object ?? node;
    const meta = (source?.userData?.ifcMetadata || {}) as IfcMetadata;
    return [
        source?.name,
        source?.type,
        source?.bimId,
        source?.userData?.bimId,
        source?.userData?.expressID,
        source?.userData?.ifcType,
        source?.userData?.globalId,
        meta.storey,
        meta.category,
        meta.typeName,
        meta.globalId,
        ...(meta.systems || []),
        ...(meta.materials || []),
        ...(meta.classifications || [])
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
};

interface SceneTreeProps {
    t: (key: string) => string;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    locatedUuid?: string | null;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onDelete?: (obj: any) => void;
    onIsolate?: (uuid: string) => void;
    onHide?: (uuid: string) => void;
    onShowAll?: () => void;
    onLocate?: (obj: any) => void;
    onClearLocate?: () => void;
    onLocateResultsChange?: (uuids: string[]) => void;
    locateResultUuids?: string[];
    clashSummaryByUuid?: Record<string, {
        total: number;
        newCount: number;
        confirmedCount: number;
        resolvedCount: number;
        worstStatus: "new" | "confirmed" | "resolved";
    }>;
}

export const SceneTree: React.FC<SceneTreeProps> = ({
    t,
    treeRoot,
    setTreeRoot,
    selectedUuid,
    locatedUuid,
    onSelect,
    onToggleVisibility,
    onDelete,
    onIsolate,
    onHide,
    onShowAll,
    onLocate,
    onClearLocate,
    onLocateResultsChange,
    locateResultUuids = [],
    clashSummaryByUuid = {}
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [clashOnlyMode, setClashOnlyMode] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(400);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectionSourceRef = useRef<"tree" | "external" | null>(null);
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
        if (selectionSourceRef.current !== "tree") return;
        setTreeRoot((prev) => {
            const expandSelectedPath = (nodes: TreeNode[]): [TreeNode[], boolean] => {
                let found = false;
                const nextNodes = nodes.map((node) => {
                    let workingNode = node;
                    if (node.uuid === selectedUuid) {
                        found = true;
                        return node;
                    }

                    if (!node.childrenLoaded && node.hasChildren) {
                        const rawChildren = getRawChildren(node);
                        const containsTarget = rawChildren.some((child) => rawTreeContainsUuid(child, selectedUuid));
                        if (containsTarget) {
                            workingNode = ensureNodeChildrenLoaded(node);
                        }
                    }

                    const [children, childFound] = expandSelectedPath(workingNode.children);
                    if (childFound) found = true;
                    return {
                        ...workingNode,
                        expanded: childFound ? true : workingNode.expanded,
                        children
                    };
                });
                return [nextNodes, found];
            };

            const [nextTree, found] = expandSelectedPath(prev);
            return found ? nextTree : prev;
        });
    }, [selectedUuid, setTreeRoot]);

    const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
        const lowercaseQuery = query.toLowerCase();
        return nodes.reduce((acc: TreeNode[], node) => {
            const matchesQuery = !query || getNodeSearchText(node).includes(lowercaseQuery);
            const sourceChildren = (query || clashOnlyMode)
                ? getRawChildren(node).map((child) => createTreeNodeFromRaw(child, node.depth + 1))
                : node.children;
            const filteredChildren = filterTree(sourceChildren, query);
            const hasClash = !!clashSummaryByUuid[node.uuid];
            const includeByClash = !clashOnlyMode || hasClash || filteredChildren.length > 0;
            const includeByQuery = !query || matchesQuery || filteredChildren.length > 0;
            if (includeByClash && includeByQuery) {
                acc.push({
                    ...node,
                    childrenLoaded: query ? true : node.childrenLoaded,
                    hasChildren: node.hasChildren ?? getRawChildren(node).length > 0,
                    expanded: query ? true : node.expanded,
                    children: filteredChildren
                });
            }
            return acc;
        }, []);
    };

    const filteredTree = useMemo(() => filterTree(treeRoot, searchQuery), [treeRoot, searchQuery, clashOnlyMode, clashSummaryByUuid]);
    const flatData = useMemo(() => flattenTree(filteredTree), [filteredTree]);
    const firstSearchMatch = useMemo(() => {
        if (!searchQuery) return null;
        const query = searchQuery.toLowerCase();
        const stack = [...treeRoot];
        while (stack.length > 0) {
            const node = stack.shift()!;
            if (getNodeSearchText(node).includes(query)) return node;
            getRawChildren(node)
                .map((child) => createTreeNodeFromRaw(child, (node.depth ?? 0) + 1))
                .forEach((child) => stack.push(child));
        }
        return null;
    }, [searchQuery, treeRoot]);

    const searchMatches = useMemo(() => {
        if (!searchQuery.trim()) return [] as TreeNode[];
        const query = searchQuery.trim().toLowerCase();
        const results: TreeNode[] = [];
        const stack = [...treeRoot];
        while (stack.length > 0) {
            const node = stack.shift()!;
            if (getNodeSearchText(node).includes(query)) {
                results.push(node);
            }
            getRawChildren(node)
                .map((child) => createTreeNodeFromRaw(child, (node.depth ?? 0) + 1))
                .forEach((child) => stack.push(child));
        }
        return results;
    }, [searchQuery, treeRoot]);

    const rowHeight = 24;
    const totalHeight = flatData.length * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const endIndex = Math.min(flatData.length, startIndex + visibleCount + 1);
    const visibleItems = flatData.slice(startIndex, endIndex);

    useEffect(() => {
        if (selectionSourceRef.current === "tree") {
            selectionSourceRef.current = null;
        }
    }, [selectedUuid]);

    useEffect(() => {
        const nextLocateResults = searchQuery.trim() ? searchMatches.map((item) => item.uuid) : [];
        onLocateResultsChange?.(nextLocateResults);
    }, [searchMatches, searchQuery, onLocateResultsChange]);

    const toggleNode = (nodeUuid: string) => {
        const toggle = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => {
                if (node.uuid === nodeUuid) {
                    const nextNode = ensureNodeChildrenLoaded(node);
                    return { ...nextNode, expanded: !node.expanded };
                }
                if (node.children.length > 0) return { ...node, children: toggle(node.children) };
                return node;
            });
        setTreeRoot((prev) => toggle(prev));
    };

    const expandAll = () => {
        const expand = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => {
                const expandedNode = ensureNodeChildrenLoaded(node);
                return {
                    ...expandedNode,
                    expanded: expandedNode.hasChildren,
                    children: expand(expandedNode.children)
                };
            });
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

    const handleLocateFirstMatch = () => {
        if (!firstSearchMatch) return;
        onSelect(firstSearchMatch.uuid, firstSearchMatch.object);
        onLocate?.(firstSearchMatch.object);
    };

    const getClashBadge = (uuid: string) => {
        const summary = clashSummaryByUuid[uuid];
        if (!summary) return null;
        if (summary.worstStatus === "new") {
            return {
                label: `${t("clash_group_new") || "新建"} ${summary.newCount}`,
                color: "var(--error)"
            };
        }
        if (summary.worstStatus === "confirmed") {
            return {
                label: `${t("clash_group_confirmed") || "已确认"} ${summary.confirmedCount}`,
                color: "var(--warning, #f59e0b)"
            };
        }
        return {
            label: `${t("clash_group_resolved") || "已解决"} ${summary.resolvedCount}`,
            color: "var(--success)"
        };
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleLocateFirstMatch();
                            }
                        }}
                        className="ui-input ui-input-compact"
                    />
                    {searchQuery && (
                        <button className="ui-search-clear" onClick={() => setSearchQuery("")}>
                            <IconClose width={14} height={14} />
                        </button>
                    )}
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        className={`ui-statusbar-tag ui-statusbar-tag-compact ${clashOnlyMode ? "active" : ""}`}
                        onClick={() => setClashOnlyMode((prev) => !prev)}
                    >
                        {t("tree_clash_only") || "仅显示冲突节点"}
                    </button>
                </div>
                {searchQuery && (
                    <div className="ui-tree-search-meta">
                        <span>
                            {(t("search_results") || "结果")}: {searchMatches.length}
                        </span>
                        <Button
                            variant="ghost"
                            className="ui-properties-action"
                            onClick={handleLocateFirstMatch}
                            disabled={!firstSearchMatch}
                        >
                            {t("locate_first_match") || "定位首个匹配"}
                        </Button>
                    </div>
                )}
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
                                className={`ui-tree-node ${node.uuid === selectedUuid ? "selected" : ""} ${locateResultUuids.includes(node.uuid) ? "matched" : ""} ${node.uuid === locatedUuid ? "located" : ""}`}
                                style={{ paddingLeft: 8 + node.depth * 16 }}
                                onClick={() => {
                                    selectionSourceRef.current = "tree";
                                    onSelect(node.uuid, node.object);
                                }}
                                onDoubleClick={(e) => {
                                    if (node.hasChildren) {
                                        e.stopPropagation();
                                        toggleNode(node.uuid);
                                    }
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, node });
                                }}
                            >
                                <div
                                    className="ui-tree-expander"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleNode(node.uuid);
                                    }}
                                >
                                    {node.hasChildren ? (
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
                                     {(() => {
                                         const badge = getClashBadge(node.uuid);
                                         if (!badge) return null;
                                         return (
                                             <span
                                                 style={{
                                                     marginLeft: 6,
                                                     padding: "0 6px",
                                                     borderRadius: 10,
                                                     border: `1px solid ${badge.color}`,
                                                     color: badge.color,
                                                     fontSize: 10,
                                                     lineHeight: "16px",
                                                     display: "inline-flex",
                                                     alignItems: "center",
                                                     verticalAlign: "middle"
                                                 }}
                                             >
                                                 {badge.label}
                                             </span>
                                         );
                                     })()}
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
                            onClick: () => onLocate?.(contextMenu.node.object)
                        },
                        {
                            divider: true
                        },
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
                            : []),
                        ...(onHide
                            ? [
                                  {
                                      label: t("hide_selected") || "隐藏选中",
                                      onClick: () => onHide(contextMenu.node.uuid)
                                  }
                              ]
                            : []),
                        ...(onIsolate
                            ? [
                                  {
                                      label: t("isolate_selection") || "隔离选择",
                                      onClick: () => onIsolate(contextMenu.node.uuid)
                                  }
                              ]
                            : []),
                        ...(onShowAll
                            ? [
                                  {
                                      label: t("show_all") || "显示全部",
                                      onClick: onShowAll
                                  }
                              ]
                            : [])
                    ]}
                />
            )}
        </div>
    );
};
