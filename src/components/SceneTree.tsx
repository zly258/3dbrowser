import React, { useMemo, useState, useRef, useEffect } from "react";
import { IconChevronRight, IconChevronDown } from "../theme/Icons";
import { Checkbox } from "./ToolPanels";

interface TreeNode {
    uuid: string;
    name: string;
    type: 'GROUP' | 'MESH' | 'TILES';
    depth: number;
    children: TreeNode[];
    expanded: boolean;
    visible: boolean;
    object: any;
    isFileNode?: boolean;
    isLastChild?: boolean;
    parentIsLast?: boolean[]; // 追踪每一层父节点是否是最后一个孩子
}

export const buildTree = (object: any, depth = 0): TreeNode => {
    // 检测 3D Tiles 渲染器：通常是一个 Group，但 userData 中可能带有 'tilesRenderer'，或由渲染器返回的组
    // 在 SceneManager 中我们将其命名为 "3D Tileset"
    
    // 检查是否为瓦片集包装器
    let isTiles = object.name === "3D Tileset"; 
    // 或者直接检查对象是否带有 tilesRenderer 属性（取决于版本）
    
    const isMesh = object.isMesh;
    
    const node: TreeNode = {
        uuid: object.uuid,
        name: object.name || "Unnamed",
        type: isTiles ? 'TILES' : isMesh ? 'MESH' : 'GROUP',
        depth,
        children: [],
        expanded: false,
        visible: object.visible !== false,
        object
    };

    // 从树中过滤掉内部辅助对象和优化后的渲染组
    if (object.children && object.children.length > 0) {
        const children = object.children.filter((c: any) => {
            // 过滤辅助对象
            if (c.name === "Helpers" || c.name === "Measure") return false;
            // 过滤优化后的渲染组（用户不应该在大纲中看到它们）
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

interface SceneTreeProps {
    t: (key: string) => string;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onModelContextMenu?: (uuid: string, clientX: number, clientY: number) => void;
    styles: any;
    theme: any;
}

export const SceneTree: React.FC<SceneTreeProps> = ({ 
    t, treeRoot, setTreeRoot, selectedUuid, onSelect, onToggleVisibility,
    onModelContextMenu, styles, theme 
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [hoveredUuid, setHoveredUuid] = useState<string | null>(null);
    
    // 过滤树结构的辅助函数
    const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
        if (!query) return nodes;
        
        const lowercaseQuery = query.toLowerCase();
        return nodes.reduce((acc: TreeNode[], node) => {
            const matches = node.name.toLowerCase().includes(lowercaseQuery);
            const filteredChildren = filterTree(node.children, query);
            
            if (matches || filteredChildren.length > 0) {
                acc.push({
                    ...node,
                    expanded: query ? true : node.expanded, // 搜索时自动展开
                    children: filteredChildren
                });
            }
            return acc;
        }, []);
    };

    const filteredTree = useMemo(() => filterTree(treeRoot, searchQuery), [treeRoot, searchQuery]);
    const flatData = useMemo(() => flattenTree(filteredTree), [filteredTree]);
    
    const rowHeight = 24;
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(400);

    useEffect(() => {
        if(containerRef.current) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) setContainerHeight(entry.contentRect.height);
            });
            resizeObserver.observe(containerRef.current);
            return () => resizeObserver.disconnect();
        }
    }, []);

    const toggleNode = (nodeUuid: string) => {
        const toggle = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map(n => {
                if (n.uuid === nodeUuid) return { ...n, expanded: !n.expanded };
                if (n.children.length > 0) return { ...n, children: toggle(n.children) };
                return n;
            });
        };
        setTreeRoot(prev => toggle(prev));
    };

    const handleCheckbox = (e: React.MouseEvent, node: TreeNode) => {
        e.stopPropagation();
        const newVisible = !node.visible;
        onToggleVisibility(node.uuid, newVisible);
    };

    const totalHeight = flatData.length * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const endIndex = Math.min(flatData.length, startIndex + visibleCount + 1);
    const visibleItems = flatData.slice(startIndex, endIndex);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>
                <input
                    type="text"
                    placeholder={t("search_nodes")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: theme.bg,
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '0px',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
            </div>
            <div ref={containerRef} style={{ ...styles.treeContainer, flex: 1 }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <div style={{ height: totalHeight, position: "relative" }}>
                <div style={{ position: "absolute", top: startIndex * rowHeight, left: 0, right: 0 }}>
                    {visibleItems.map((node, index) => (
                        <div key={node.uuid} 
                                style={{
                                    ...styles.treeNode(node.uuid === selectedUuid, node.uuid === hoveredUuid),
                                    paddingLeft: 8,
                                }}
                                onClick={() => onSelect(node.uuid, node.object)}
                                onMouseEnter={() => setHoveredUuid(node.uuid)}
                                onMouseLeave={() => setHoveredUuid(null)}
                                onContextMenu={(e) => {
                                    if (!node.isFileNode || !onModelContextMenu) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onModelContextMenu(node.uuid, e.clientX, e.clientY);
                                }}
                        >
                            {/* Connection Lines */}
                            {node.depth > 0 && (
                                <div style={{ display: 'flex', height: '100%', alignItems: 'center', flexShrink: 0 }}>
                                    {node.parentIsLast?.map((isLast, i) => (
                                        <div key={i} style={{ 
                                            width: 16, 
                                            height: '100%', 
                                            position: 'relative',
                                            borderLeft: isLast ? 'none' : `1px solid ${theme.border}60` 
                                        }} />
                                    ))}
                                    <div style={{ 
                                        width: 16, 
                                        height: '100%', 
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        {/* Vertical line segment */}
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            bottom: node.isLastChild ? '50%' : 0,
                                            borderLeft: `1px solid ${theme.border}60`
                                        }} />
                                        {/* Horizontal line segment */}
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            width: 8,
                                            borderTop: `1px solid ${theme.border}60`
                                        }} />
                                    </div>
                                </div>
                            )}

                            <div style={styles.expander} onClick={(e) => { e.stopPropagation(); toggleNode(node.uuid); }}>
                                {node.children.length > 0 ? (
                                    node.expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />
                                ) : null}
                            </div>
                            
                            <Checkbox 
                                checked={node.visible} 
                                onChange={(val: boolean) => onToggleVisibility(node.uuid, val)} 
                                styles={styles} 
                                theme={theme}
                                style={{ marginRight: 6, padding: 0, flexShrink: 0 }}
                            />
                            
                            <div style={{ ...styles.nodeLabel, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</div>
                        </div>
                    ))}
                </div>
                </div>
            </div>
        </div>
    );
};
