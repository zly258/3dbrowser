import React from "react";
import { TFunc } from "../theme/Locales";
interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: TFunc;
    styles: any;
    theme: any;
}
export declare const AboutModal: React.FC<AboutModalProps>;
export {};
