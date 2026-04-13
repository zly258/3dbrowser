import React, { useState, useRef, useEffect } from "react";

interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
        enabled?: boolean;
}

export const ClassicMenuItem = ({ label, children, enabled = true }: MenuItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => {
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleMenu = () => {
        if (enabled) {
            setIsOpen(!isOpen);
        }
    };

    return (
        <div
            ref={menuRef}
            className="ui-menubar-item"
        >
            <div
                className={`ui-toolbar-btn ${isOpen ? 'active' : ''}`}
                aria-disabled={!enabled}
                onClick={toggleMenu}
            >
                {label}
            </div>
            {isOpen && enabled && (
                <div className="ui-dropdown-menu ui-menubar-dropdown">
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
}

export const ClassicSubItem = ({ label, onClick, enabled = true, checked, icon }: SubItemProps) => {
    return (
        <div
            className={`ui-context-menu-item ui-menu-subitem ${!enabled ? 'disabled' : ''}`}
            onClick={() => {
                if (enabled) {
                    onClick();
                }
            }}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        >
            <div className="ui-menu-subitem-main">
                {checked !== undefined && (
                    <div className={`ui-menu-check ${checked ? 'checked' : ''}`}>
                        {checked && <div className="ui-menu-check-mark">✓</div>}
                    </div>
                )}
                {icon && checked === undefined && (
                    <span className="ui-menu-subitem-icon">
                        {icon}
                    </span>
                )}
                {label}
            </div>
        </div>
    );
};
