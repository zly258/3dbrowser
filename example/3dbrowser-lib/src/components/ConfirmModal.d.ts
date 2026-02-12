import React from "react";
import { TFunc } from "../theme/Locales";
interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    t: TFunc;
    styles: any;
    theme: any;
}
export declare const ConfirmModal: React.FC<ConfirmModalProps>;
export {};
