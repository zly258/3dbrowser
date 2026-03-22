import React from "react";
interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    enabled?: boolean;
}
export declare const ClassicMenuItem: ({ label, children, enabled }: MenuItemProps) => import("react/jsx-runtime").JSX.Element;
interface SubItemProps {
    label: string;
    onClick: () => void;
    enabled?: boolean;
    checked?: boolean;
}
export declare const ClassicSubItem: ({ label, onClick, enabled, checked }: SubItemProps) => import("react/jsx-runtime").JSX.Element;
export {};
