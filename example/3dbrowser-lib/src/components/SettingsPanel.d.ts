import React from "react";
import { TFunc, Lang } from "../theme/Locales";
import { SceneSettings } from "../utils/SceneManager";
interface SettingsModalProps {
    t: TFunc;
    onClose: () => void;
    settings: SceneSettings;
    onUpdate: (s: Partial<SceneSettings>) => void;
    currentLang: Lang;
    setLang: (l: Lang) => void;
    themeMode: 'dark' | 'light';
    setThemeMode: (m: 'dark' | 'light') => void;
    showStats: boolean;
    setShowStats: (v: boolean) => void;
    styles: any;
    theme: any;
}
export declare const SettingsPanel: React.FC<SettingsModalProps>;
export {};
