import React, { useEffect, useRef, useState } from "react";
import { ThemeColors } from "../theme/Styles";

interface ContextMenuItem {
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
    divider?: boolean;
    slider?: boolean;
    value?: number;
    onChange?: (val: number) => void;
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
                if (item.slider) {
                    return (
                        <div key={index} className="ui-context-menu-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'default' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                <span>{item.label}</span>
                                <span>{Math.round((item.value || 0) * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" max="1" step="0.01" 
                                value={item.value || 0} 
                                onChange={(e) => item.onChange?.(parseFloat(e.target.value))}
                                style={{ width: '100%', cursor: 'pointer' }}
                            />
                        </div>
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

