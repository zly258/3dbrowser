import React, { useEffect, useRef, useState } from "react";
import { cx } from "./utils";

interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    enabled?: boolean;
    className?: string;
}

export const ClassicMenuItem: React.FC<MenuItemProps> = ({
    label,
    children,
    enabled = true,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => setIsOpen(false);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeMenu();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    const toggleMenu = () => {
        if (!enabled) return;
        setIsOpen((prev) => !prev);
    };

    return (
        <div ref={menuRef} className={cx("ui-menubar-item", className)}>
            <button
                type="button"
                className={cx("ui-toolbar-btn ui-menubar-btn", isOpen && "active")}
                aria-disabled={!enabled}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                disabled={!enabled}
                onClick={toggleMenu}
            >
                <span className="ui-toolbar-btn-label">{label}</span>
            </button>

            {isOpen && enabled && (
                <div className="ui-dropdown-menu ui-menubar-dropdown" role="menu">
                    {children(closeMenu)}
                </div>
            )}
        </div>
    );
};

interface SubItemProps {
    label: string;
    onClick: () => void;
    enabled?: boolean;
    checked?: boolean;
    icon?: React.ReactNode;
    className?: string;
}

export const ClassicSubItem: React.FC<SubItemProps> = ({
    label,
    onClick,
    enabled = true,
    checked,
    icon,
    className = ""
}) => {
    const handleClick = () => {
        if (!enabled) return;
        onClick();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!enabled) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    };

    return (
        <div
            className={cx("ui-context-menu-item ui-menu-subitem", !enabled && "disabled", className)}
            role="menuitem"
            aria-disabled={!enabled}
            tabIndex={enabled ? 0 : -1}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div className="ui-menu-subitem-main">
                {checked !== undefined && (
                    <span className={cx("ui-menu-check", checked && "checked")}>
                        {checked && <span className="ui-menu-check-mark">✓</span>}
                    </span>
                )}

                {icon && checked === undefined && (
                    <span className="ui-menu-subitem-icon">{icon}</span>
                )}

                <span className="ui-menu-subitem-label">{label}</span>
            </div>
        </div>
    );
};
