import React from "react";
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
    parentIsLast?: boolean[];
}
export declare const buildTree: (object: any, depth?: number) => TreeNode;
interface SceneTreeProps {
    t: (key: string) => string;
    treeRoot: TreeNode[];
    setTreeRoot: React.Dispatch<React.SetStateAction<TreeNode[]>>;
    selectedUuid: string | null;
    onSelect: (uuid: string, obj: any) => void;
    onToggleVisibility: (uuid: string, visible: boolean) => void;
    onDelete?: (obj: any) => void;
    onFocus?: (obj: any) => void;
    styles: any;
    theme: any;
}
export declare const SceneTree: React.FC<SceneTreeProps>;
export {};
