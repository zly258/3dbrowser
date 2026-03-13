import React from "react";
interface MenuItemProps {
    label: string;
    children: (close: () => void) => React.ReactNode;
    styles: any;
    enabled?: boolean;
}
export declare const ClassicMenuItem: ({ label, children, styles, enabled }: MenuItemProps) => import("react/jsx-runtime").JSX.Element;
interface SubItemProps {
    label: string;
    onClick: () => void;
    styles: any;
    enabled?: boolean;
    checked?: boolean;
}
export declare const ClassicSubItem: ({ label, onClick, styles, enabled, checked }: SubItemProps) => import("react/jsx-runtime").JSX.Element;
export {};
