import React, { useMemo, useState, useRef, useEffect } from "react";
import { SceneManager } from "../utils/SceneManager";
import { IconTrash } from "../theme/Icons";

interface TreeNode {
    uuid: string;
    name: string;
    type: 'GROUP' | 'MESH' | 'TILES';
    depth: number;
    children: TreeNode[];
    expanded: boolean;
    visible: boolean;
    object: any;
}

export const buildTree = (object: any, depth = 0): TreeNode => {
    // 检测TilesRenderer。通常是一个Group，但在用户数据中有'tilesRenderer'属性，或者是我们传递的渲染器返回的组
    // 在我们的SceneManager中，我们将其命名为"3D Tileset"
    
    // 检查是否为瓦片集包装器
    let isTiles = object.name === "3D Tileset"; 
    // 或者检查对象上是否有tilesRenderer属性（取决于版本）
    
    const isMesh = object.isMesh;
    
    const node: TreeNode = {
        uuid: object.uuid,
        name: object.name || "Unnamed",
        type: isTiles ? 'TILES' : isMesh ? 'MESH' : 'GROUP',
        depth,
        children: [],
        expanded: depth < 2, // 默认展开前几层
        visible: object.visible !== false,
        object
    };

    // 从树中过滤掉内部辅助对象
    if (object.children && object.children.length > 0) {
        node.children = object.children
            .filter((c: any) => c.name !== "Helpers" && c.name !== "Measure")
            .map((c: any) => buildTree(c, depth + 1));
    }

    return node;
};

const flattenTree = (nodes: TreeNode[], result: TreeNode[] = []) => {
    for (const node of nodes) {
        result.push(node);
        if (node.expanded && node.children.length > 0) {
            flattenTree(node.children, result);
        }
    }
    return result;
};

interface SceneTreeProps {
    sceneMgr: SceneManager | null;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onDelete: (uuid: string) => void;
    styles: any;
    theme: any;
}

export const SceneTree: React.FC<SceneTreeProps> = ({ sceneMgr, treeRoot, setTreeRoot, selectedUuid, onSelect, onToggleVisibility, onDelete, styles, theme }) => {
    const flatData = useMemo(() => flattenTree(treeRoot), [treeRoot]);
    const rowHeight = 24;
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(400);

    // 用于跟踪删除按钮悬停状态的状态
    const [hoveredUuid, setHoveredUuid] = useState<string | null>(null);

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

    const handleDelete = (e: React.MouseEvent, uuid: string) => {
        e.stopPropagation();
        onDelete(uuid);
    }

    const totalHeight = flatData.length * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const endIndex = Math.min(flatData.length, startIndex + visibleCount + 1);
    const visibleItems = flatData.slice(startIndex, endIndex);

    return (
        <div ref={containerRef} style={styles.treeContainer} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
            <div style={{ height: totalHeight, position: "relative" }}>
                <div style={{ position: "absolute", top: startIndex * rowHeight, left: 0, right: 0 }}>
                    {visibleItems.map((node, index) => (
                        <div key={node.uuid} 
                                style={{
                                    ...styles.treeNode,
                                    paddingLeft: node.depth * 16 + 8,
                                    ...(node.uuid === selectedUuid ? styles.treeNodeSelected : {})
                                }}
                                onClick={() => onSelect(node.uuid, sceneMgr?.contentGroup.getObjectByProperty("uuid", node.uuid))}
                                onMouseEnter={() => setHoveredUuid(node.uuid)}
                                onMouseLeave={() => setHoveredUuid(null)}
                        >
                            <div style={styles.expander} onClick={(e) => { e.stopPropagation(); toggleNode(node.uuid); }}>
                                {node.children.length > 0 && <span style={{fontSize: 10}}>{node.expanded ? "▼" : "▶"}</span>}
                            </div>
                            
                            <input 
                                type="checkbox" 
                                checked={node.visible} 
                                readOnly // Controlled by onClick
                                onClick={(e) => handleCheckbox(e, node)}
                                style={{marginRight: 8, cursor: 'pointer'}}
                            />
                            
                            <div style={styles.nodeLabel}>{node.name}</div>

                            {/* Delete button only for top-level nodes (files) */}
                            {node.depth === 0 && (node.uuid === hoveredUuid || node.uuid === selectedUuid) && (
                                <div 
                                    onClick={(e) => handleDelete(e, node.uuid)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 20, height: 20, cursor: 'pointer', color: theme.danger,
                                        marginLeft: 5
                                    }}
                                    title="Delete File"
                                >
                                    <IconTrash width={12} height={12} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
