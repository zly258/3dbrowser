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
            style={{ position: 'relative', height: '100%' }}
        >
            <div
                className={`ui-toolbar-btn ${isOpen ? 'active' : ''}`}
                style={{ padding: '0 10px', opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none' }}
                onClick={toggleMenu}
            >
                {label}
            </div>
            {isOpen && enabled && (
                <div className="ui-context-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '2px', padding: '4px 0', minWidth: '160px' }}>
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
}

export const ClassicSubItem = ({ label, onClick, enabled = true, checked }: SubItemProps) => {
    return (
        <div
            className={`ui-context-menu-item flex items-center justify-between ${!enabled ? 'disabled' : ''}`}
            onClick={() => {
                if (enabled) {
                    onClick();
                }
            }}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {checked !== undefined && (
                    <div style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "2px",
                        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-color)'}`,
                        backgroundColor: checked ? 'var(--accent)' : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                        position: "relative",
                        cursor: 'pointer'
                    }}>
                        {checked && <div style={{ color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                    </div>
                )}
                {label}
            </div>
        </div>
    );
};
