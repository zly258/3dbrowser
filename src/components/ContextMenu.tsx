import React, { useEffect, useRef, useState } from "react";
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
    theme?: ThemeColors;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, theme }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="ui-context-menu"
            style={{ left: x, top: y }}
        >
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <div
                            key={index}
                            className="ui-context-menu-divider"
                        />
                    );
                }
                return (
                    <div
                        key={index}
                        onClick={() => {
                            if (!item.disabled && item.onClick) {
                                item.onClick();
                                onClose();
                            }
                        }}
                        className={`ui-context-menu-item ${item.disabled ? 'disabled' : ''}`}
                    >
                        {item.label}
                    </div>
                );
            })}
        </div>
    );
};

