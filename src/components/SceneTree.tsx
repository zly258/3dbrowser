import React, { useMemo, useState, useRef, useEffect } from "react";
import { IconChevronRight, IconChevronLeft, IconChevronDown, IconClose, IconTarget } from "../theme/Icons";
import { Button, Checkbox, Select } from "./common";
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

interface IfcFilterState {
    storey: string;
    elevation: string;
    system: string;
    category: string;
    material: string;
}

type LocatorMode = "all" | "name" | "globalId" | "classification" | "typeName";

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

const getNodeSearchText = (node: TreeNode | any) => {
    const source = node?.object ?? node;
    const meta = (source?.userData?.ifcMetadata || {}) as IfcMetadata;
    return [
        source?.name,
        source?.type,
        source?.bimId,
        source?.userData?.bimId,
        source?.userData?.expressID,
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

const rawTreeContainsUuid = (rawNode: any, targetUuid: string): boolean => {
    if (!rawNode) return false;
    if (rawNode.id === targetUuid || rawNode.uuid === targetUuid) return true;
    const children = Array.isArray(rawNode.children) ? rawNode.children : [];
    return children.some((child) => rawTreeContainsUuid(child, targetUuid));
};

const getNodeLocatorText = (node: TreeNode | any, mode: LocatorMode) => {
    const source = node?.object ?? node;
    const meta = (source?.userData?.ifcMetadata || {}) as IfcMetadata;
    const valuesByMode: Record<LocatorMode, Array<string | undefined | null | number>> = {
        all: [
            source?.name,
            meta.globalId,
            meta.typeName,
            meta.category,
            ...(meta.classifications || [])
        ],
        name: [source?.name],
        globalId: [meta.globalId],
        classification: meta.classifications || [],
        typeName: [meta.typeName, meta.category]
    };

    return valuesByMode[mode]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .join(" ")
        .toLowerCase();
};

interface SceneTreeProps {
    t: (key: string) => string;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    locatedUuid?: string | null;
    selectedStorey?: string;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onDelete?: (obj: any) => void;
    onFocus?: (obj: any) => void;
    onIsolate?: (uuid: string) => void;
    onHide?: (uuid: string) => void;
    onShowAll?: () => void;
    onApplyIfcFiltersToViewport?: (filters: IfcFilterState) => void;
    onApplyStoreyWorkset?: (storeys: string[]) => void;
    onLocate?: (obj: any) => void;
    onClearLocate?: () => void;
    onLocateResultsChange?: (uuids: string[]) => void;
    locateResultUuids?: string[];
}

export const SceneTree: React.FC<SceneTreeProps> = ({
    t,
    treeRoot,
    setTreeRoot,
    selectedUuid,
    locatedUuid,
    selectedStorey,
    onSelect,
    onToggleVisibility,
    onDelete,
    onFocus,
    onIsolate,
    onHide,
    onShowAll,
    onApplyIfcFiltersToViewport,
    onApplyStoreyWorkset,
    onLocate,
    onClearLocate,
    onLocateResultsChange,
    locateResultUuids = []
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [locatorMode, setLocatorMode] = useState<LocatorMode>("all");
    const [locatorQuery, setLocatorQuery] = useState("");
    const [locatorIndex, setLocatorIndex] = useState(0);
    const [filters, setFilters] = useState<IfcFilterState>({
        storey: "",
        elevation: "",
        system: "",
        category: "",
        material: ""
    });
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(400);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchExpandedStateRef = useRef<Map<string, boolean> | null>(null);
    const previousSearchQueryRef = useRef("");
    const lastLocateResultsRef = useRef<string[]>([]);

    const collectIfcOptions = (nodes: TreeNode[]) => {
        const storeys = new Set<string>();
        const systems = new Set<string>();
        const categories = new Set<string>();
        const materials = new Set<string>();
        const elevations = new Set<number>();
        let hasIfcModel = false;

        const walk = (list: Array<TreeNode | any>) => {
            list.forEach((entry) => {
                const source = entry?.object ?? entry;
                const meta = source?.userData?.ifcMetadata as IfcMetadata | undefined;
                if (source?.userData?.isIFC || meta) hasIfcModel = true;
                if (meta?.storey) storeys.add(meta.storey);
                if (typeof meta?.elevation === "number" && Number.isFinite(meta.elevation)) elevations.add(meta.elevation);
                if (meta?.category) categories.add(meta.category);
                meta?.systems?.forEach((item) => systems.add(item));
                meta?.materials?.forEach((item) => materials.add(item));
                const rawChildren = getRawChildren(entry);
                if (rawChildren.length > 0) walk(rawChildren);
            });
        };

        walk(nodes);

        const sort = (set: Set<string>) => Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        return {
            storeys: sort(storeys),
            elevations: Array.from(elevations).sort((a, b) => a - b),
            systems: sort(systems),
            categories: sort(categories),
            materials: sort(materials),
            hasIfcModel
        };
    };

    const ifcOptions = useMemo(() => collectIfcOptions(treeRoot), [treeRoot]);
    const hasIfcFilters =
        ifcOptions.storeys.length > 0 ||
        ifcOptions.elevations.length > 0 ||
        ifcOptions.systems.length > 0 ||
        ifcOptions.categories.length > 0 ||
        ifcOptions.materials.length > 0;
    const hasIfcLocator = ifcOptions.hasIfcModel;
    const hasActiveFilters = Object.values(filters).some(Boolean);
    const selectedStoreyIndex = selectedStorey ? ifcOptions.storeys.indexOf(selectedStorey) : -1;
    const adjacentStoreys = selectedStoreyIndex >= 0
        ? ifcOptions.storeys.filter((_item, index) => Math.abs(index - selectedStoreyIndex) <= 1)
        : [];
    const canApplyCurrentStorey = Boolean(selectedStorey);
    const canApplyAdjacentStoreys = adjacentStoreys.length > 1;

    const matchesIfcFilters = (meta?: IfcMetadata) => {
        if (!hasActiveFilters) return true;
        if (!meta) return false;
        if (filters.storey && meta.storey !== filters.storey) return false;
        if (filters.elevation && String(meta.elevation) !== filters.elevation) return false;
        if (filters.category && meta.category !== filters.category) return false;
        if (filters.system && !(meta.systems || []).includes(filters.system)) return false;
        if (filters.material && !(meta.materials || []).includes(filters.material)) return false;
        return true;
    };

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
            const meta = node.object?.userData?.ifcMetadata as IfcMetadata | undefined;
            const matchesQuery = !query || getNodeSearchText(node).includes(lowercaseQuery);
            const matchesFilter = matchesIfcFilters(meta);
            const sourceChildren = query || hasActiveFilters ? getRawChildren(node).map((child) => createTreeNodeFromRaw(child, node.depth + 1)) : node.children;
            const filteredChildren = filterTree(sourceChildren, query);
            if ((matchesQuery && matchesFilter) || filteredChildren.length > 0) {
                acc.push({
                    ...node,
                    childrenLoaded: query || hasActiveFilters ? true : node.childrenLoaded,
                    hasChildren: node.hasChildren ?? getRawChildren(node).length > 0,
                    expanded: query || hasActiveFilters ? true : node.expanded,
                    children: filteredChildren
                });
            }
            return acc;
        }, []);
    };

    const filteredTree = useMemo(() => filterTree(treeRoot, searchQuery), [treeRoot, searchQuery, filters, hasActiveFilters]);
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
    const locatorMatches = useMemo(() => {
        if (!locatorQuery.trim()) return [];
        const query = locatorQuery.trim().toLowerCase();
        const results: TreeNode[] = [];
        const stack = [...treeRoot];
        while (stack.length > 0) {
            const node = stack.shift()!;
            if (getNodeLocatorText(node, locatorMode).includes(query)) {
                results.push(node);
            }
            getRawChildren(node)
                .map((child) => createTreeNodeFromRaw(child, (node.depth ?? 0) + 1))
                .forEach((child) => stack.push(child));
        }
        return results;
    }, [locatorMode, locatorQuery, treeRoot]);
    const clampedLocatorIndex = locatorMatches.length > 0
        ? Math.min(locatorIndex, locatorMatches.length - 1)
        : 0;
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

        const itemCenter = targetIndex * rowHeight + rowHeight / 2;
        containerRef.current.scrollTop = Math.max(0, itemCenter - containerHeight / 2);
    }, [selectedUuid, flatData, containerHeight, rowHeight]);

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
        if (onLocate) {
            onLocate(firstSearchMatch.object);
            return;
        }
        onFocus?.(firstSearchMatch.object);
    };

    const handleLocateIfcMatch = (matchIndex = 0) => {
        const target = locatorMatches[matchIndex];
        if (!target) return;
        onSelect(target.uuid, target.object);
        onLocate?.(target.object);
    };

    useEffect(() => {
        setLocatorIndex(0);
    }, [locatorMode, locatorQuery]);

    useEffect(() => {
        if (!locatorQuery.trim()) {
            onClearLocate?.();
        }
    }, [locatorQuery, onClearLocate]);

    useEffect(() => {
        const nextLocateResults = locatorQuery.trim()
            ? locatorMatches.map((item) => item.uuid)
            : [];
        const prevLocateResults = lastLocateResultsRef.current;
        const changed = prevLocateResults.length !== nextLocateResults.length ||
            prevLocateResults.some((uuid, index) => uuid !== nextLocateResults[index]);

        if (!changed) return;

        lastLocateResultsRef.current = nextLocateResults;
        onLocateResultsChange?.(nextLocateResults);
    }, [locatorMatches, locatorQuery, onLocateResultsChange]);

    useEffect(() => {
        if (locatorMatches.length === 0 && locatorIndex !== 0) {
            setLocatorIndex(0);
        } else if (locatorMatches.length > 0 && locatorIndex > locatorMatches.length - 1) {
            setLocatorIndex(locatorMatches.length - 1);
        }
    }, [locatorIndex, locatorMatches.length]);

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
                {searchQuery && (
                    <div className="ui-tree-search-meta">
                        <span>
                            {(t("search_results") || "结果")}: {flatData.length}
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
                {hasIfcLocator && (
                    <div className="ui-tree-locator">
                        <Select
                            value={locatorMode}
                            onChange={(value) => setLocatorMode(value as LocatorMode)}
                            options={[
                                { value: "all", label: t("ifc_locator_all") || "综合" },
                                { value: "name", label: t("ifc_locator_name") || "名称" },
                                { value: "globalId", label: t("ifc_locator_globalid") || "GlobalId" },
                                { value: "classification", label: t("ifc_locator_classification") || "分类编码" },
                                { value: "typeName", label: t("ifc_locator_type") || "类型" }
                            ]}
                            className="ui-input-compact"
                        />
                        <div className="ui-search-input-wrap">
                            <input
                                type="text"
                                placeholder={t("ifc_locator_placeholder") || "按 IFC 标识定位..."}
                                value={locatorQuery}
                                onChange={(e) => {
                                    setLocatorQuery(e.target.value);
                                    setLocatorIndex(0);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleLocateIfcMatch(clampedLocatorIndex);
                                    }
                                }}
                                className="ui-input ui-input-compact"
                            />
                            {locatorQuery && (
                                <button className="ui-search-clear" onClick={() => {
                                    setLocatorQuery("");
                                    setLocatorIndex(0);
                                }}>
                                    <IconClose width={14} height={14} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {hasIfcLocator && locatorQuery && (
                    <div className="ui-tree-search-meta">
                        <span>
                            {(t("ifc_locator_results") || "IFC结果")}: {locatorMatches.length}
                            {locatorMatches.length > 0 ? ` (${clampedLocatorIndex + 1}/${locatorMatches.length})` : ""}
                        </span>
                        <div className="ui-tree-search-actions">
                            <Button
                                variant="ghost"
                                className="ui-properties-action ui-icon-btn ui-tree-locator-btn"
                                onClick={() => {
                                    const nextIndex = Math.max(0, clampedLocatorIndex - 1);
                                    setLocatorIndex(nextIndex);
                                    handleLocateIfcMatch(nextIndex);
                                }}
                                disabled={locatorMatches.length === 0 || clampedLocatorIndex === 0}
                                title={t("ifc_locator_prev") || "上一个"}
                            >
                                <IconChevronLeft size={18} />
                            </Button>
                            <Button
                                variant="ghost"
                                className="ui-properties-action ui-icon-btn ui-tree-locator-btn"
                                onClick={() => {
                                    const nextIndex = Math.min(locatorMatches.length - 1, clampedLocatorIndex + 1);
                                    setLocatorIndex(nextIndex);
                                    handleLocateIfcMatch(nextIndex);
                                }}
                                disabled={locatorMatches.length === 0 || clampedLocatorIndex >= locatorMatches.length - 1}
                                title={t("ifc_locator_next") || "下一个"}
                            >
                                <IconChevronRight size={18} />
                            </Button>
                            <Button
                                variant="ghost"
                                className="ui-properties-action ui-icon-btn ui-tree-locator-btn"
                                onClick={() => handleLocateIfcMatch(clampedLocatorIndex)}
                                disabled={locatorMatches.length === 0}
                                title={t("ifc_locator_action") || "定位构件"}
                            >
                                <IconTarget size={18} />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {hasIfcFilters && (
                <div className="ui-tree-filters">
                    <div className="ui-tree-filter-grid">
                        <Select
                            value={filters.storey}
                            onChange={(value) => setFilters((prev) => ({ ...prev, storey: value }))}
                            options={[
                                { value: "", label: t("ifc_filter_storey") || "全部楼层" },
                                ...ifcOptions.storeys.map((item) => ({ value: item, label: item }))
                            ]}
                            className="ui-input-compact"
                        />
                        <Select
                            value={filters.system}
                            onChange={(value) => setFilters((prev) => ({ ...prev, system: value }))}
                            options={[
                                { value: "", label: t("ifc_filter_system") || "全部系统" },
                                ...ifcOptions.systems.map((item) => ({ value: item, label: item }))
                            ]}
                            className="ui-input-compact"
                        />
                        <Select
                            value={filters.elevation}
                            onChange={(value) => setFilters((prev) => ({ ...prev, elevation: value }))}
                            options={[
                                { value: "", label: t("ifc_filter_elevation") || "全部标高" },
                                ...ifcOptions.elevations.map((item) => ({ value: String(item), label: String(item) }))
                            ]}
                            className="ui-input-compact"
                        />
                        <Select
                            value={filters.category}
                            onChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
                            options={[
                                { value: "", label: t("ifc_filter_category") || "全部类别" },
                                ...ifcOptions.categories.map((item) => ({ value: item, label: item }))
                            ]}
                            className="ui-input-compact"
                        />
                        <Select
                            value={filters.material}
                            onChange={(value) => setFilters((prev) => ({ ...prev, material: value }))}
                            options={[
                                { value: "", label: t("ifc_filter_material") || "全部材质" },
                                ...ifcOptions.materials.map((item) => ({ value: item, label: item }))
                            ]}
                            className="ui-input-compact"
                        />
                    </div>
                    {hasActiveFilters && (
                        <div className="ui-tree-filter-actions">
                            <Button
                                variant="ghost"
                                className="ui-properties-action"
                                onClick={() => onApplyIfcFiltersToViewport?.(filters)}
                            >
                                {t("ifc_filter_apply_viewport") || "应用到视口"}
                            </Button>
                            <Button
                                variant="ghost"
                                className="ui-properties-action"
                                onClick={() =>
                                    setFilters({
                                        storey: "",
                                        elevation: "",
                                        system: "",
                                        category: "",
                                        material: ""
                                    })
                                }
                            >
                                {t("ifc_filter_clear") || "清除筛选"}
                            </Button>
                        </div>
                    )}
                    {selectedStorey && (
                        <div className="ui-tree-filter-actions ui-tree-workset-actions">
                            <Button
                                variant="ghost"
                                className="ui-properties-action"
                                onClick={() => onApplyStoreyWorkset?.([selectedStorey])}
                                disabled={!canApplyCurrentStorey}
                            >
                                {t("ifc_workset_current") || "当前楼层"}
                            </Button>
                            <Button
                                variant="ghost"
                                className="ui-properties-action"
                                onClick={() => onApplyStoreyWorkset?.(adjacentStoreys)}
                                disabled={!canApplyAdjacentStoreys}
                            >
                                {t("ifc_workset_adjacent") || "上下楼层"}
                            </Button>
                        </div>
                    )}
                </div>
            )}

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
                                style={{ paddingLeft: 8 }}
                                onClick={() => onSelect(node.uuid, node.object)}
                                onDoubleClick={() => (onLocate ? onLocate(node.object) : onFocus?.(node.object))}
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


