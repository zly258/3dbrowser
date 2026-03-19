import React from "react";
import { ThemeColors } from "../theme/Styles";
interface ContextMenuItem {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    divider?: boolean;
}
interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
    theme: ThemeColors;
}
export declare const ContextMenu: React.FC<ContextMenuProps>;
export {};
