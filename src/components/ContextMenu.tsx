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
    theme: ThemeColors;
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
            style={{
                position: 'fixed',
                left: x,
                top: y,
                backgroundColor: theme.panelBg,
                border: `1px solid ${theme.border}`,
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10000,
                minWidth: '160px',
                padding: '4px 0',
            }}
        >
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <div
                            key={index}
                            style={{
                                height: '1px',
                                backgroundColor: theme.border,
                                margin: '4px 0',
                            }}
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
                        style={{
                            padding: '8px 16px',
                            fontSize: '12px',
                            color: item.disabled ? theme.textMuted : theme.text,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            backgroundColor: 'transparent',
                            transition: 'background-color 0.1s',
                            opacity: item.disabled ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                            if (!item.disabled) {
                                e.currentTarget.style.backgroundColor = theme.itemHover;
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        {item.label}
                    </div>
                );
            })}
        </div>
    );
};
