import React, { useState, useRef, useEffect } from "react";

interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    styles: any;
    enabled?: boolean;
}

export const ClassicMenuItem = ({ label, children, styles, enabled = true }: MenuItemProps) => {
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

    const itemStyle = {
        ...styles.classicMenuItem(isOpen, false),
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
        pointerEvents: enabled ? 'auto' : 'none' as any,
    };

    return (
        <div
            ref={menuRef}
            style={{ position: 'relative', height: '100%' }}
        >
            <div
                style={itemStyle}
                onClick={toggleMenu}
            >
                {label}
            </div>
            {isOpen && enabled && (
                <div style={styles.classicMenuDropdown}>
                    {children(closeMenu)}
                </div>
            )}
        </div>
    );
};

interface SubItemProps {
    label: string;
    onClick: () => void;
    styles: any;
    enabled?: boolean;
    checked?: boolean;
}

export const ClassicSubItem = ({ label, onClick, styles, enabled = true, checked }: SubItemProps) => {
    const [hover, setHover] = useState(false);

    const itemStyle = {
        ...styles.classicMenuSubItem(hover),
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
        pointerEvents: enabled ? 'auto' : 'none' as any,
        outline: 'none',
    };

    return (
        <div
            style={itemStyle}
            onClick={() => {
                if (enabled) {
                    setHover(false);
                    onClick();
                }
            }}
            onMouseEnter={() => enabled && setHover(true)}
            onMouseLeave={() => setHover(false)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {checked !== undefined && (
                    <div style={styles.checkboxCustom(checked)}>
                        {checked && <div style={styles.checkboxCheckmark}>✓</div>}
                    </div>
                )}
                {label}
            </div>
        </div>
    );
};
