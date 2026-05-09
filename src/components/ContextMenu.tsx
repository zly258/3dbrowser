import React, { useLayoutEffect, useRef, useState } from "react";
import { ThemeColors } from "../theme/styles";

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

const MENU_MARGIN = 8;

export const ContextMenu: React.FC<ContextMenuProps> = ({
    x,
    y,
    items,
    onClose,
    theme
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: x, top: y });
    void theme;

    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;

        const rect = menu.getBoundingClientRect();
        const nextLeft = Math.min(
            Math.max(MENU_MARGIN, x),
            Math.max(MENU_MARGIN, window.innerWidth - rect.width - MENU_MARGIN)
        );
        const nextTop = Math.min(
            Math.max(MENU_MARGIN, y),
            Math.max(MENU_MARGIN, window.innerHeight - rect.height - MENU_MARGIN)
        );

        setPosition({ left: nextLeft, top: nextTop });
    }, [x, y, items]);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    const handleItemClick = (item: ContextMenuItem) => {
        if (item.disabled || !item.onClick) return;
        item.onClick();
        onClose();
    };

    const handleItemKeyDown = (
        event: React.KeyboardEvent<HTMLDivElement>,
        item: ContextMenuItem
    ) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleItemClick(item);
    };

    return (
        <div
            ref={menuRef}
            className="ui-context-menu"
            style={{ left: position.left, top: position.top }}
            role="menu"
        >
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <div
                            key={`divider_${index}`}
                            className="ui-context-menu-divider"
                        />
                    );
                }

                if (item.slider) {
                    const value = item.value ?? 0;

                    return (
                        <div
                            key={`slider_${index}`}
                            className="ui-context-menu-item ui-context-menu-slider"
                        >
                            <div className="ui-context-menu-slider-row">
                                <span>{item.label}</span>
                                <span>{Math.round(value * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={value}
                                onChange={(event) => item.onChange?.(parseFloat(event.target.value))}
                                className="ui-context-menu-slider-input"
                            />
                        </div>
                    );
                }

                return (
                    <div
                        key={`item_${index}`}
                        role="menuitem"
                        tabIndex={item.disabled ? -1 : 0}
                        aria-disabled={item.disabled}
                        onClick={() => handleItemClick(item)}
                        onKeyDown={(event) => handleItemKeyDown(event, item)}
                        className={`ui-context-menu-item${item.disabled ? " disabled" : ""}`}
                    >
                        {item.label}
                    </div>
                );
            })}
        </div>
    );
};
