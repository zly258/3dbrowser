import { SceneManager, SceneSettings } from "./src/utils/SceneManager";
import { Lang } from "./src/theme/Locales";
export interface ThreeViewerProps {
    allowDragOpen?: boolean;
    hiddenMenus?: string[];
    libPath?: string;
    defaultTheme?: 'dark' | 'light';
    defaultLang?: Lang;
    showStats?: boolean;
    showOutline?: boolean;
    showProperties?: boolean;
    initialSettings?: Partial<SceneSettings>;
    initialFiles?: (string | File) | (string | File)[];
    onSelect?: (uuid: string, object: any) => void;
    onLoad?: (manager: SceneManager) => void;
    hideDeleteModel?: boolean;
}
export declare const ThreeViewer: ({ allowDragOpen, hiddenMenus, libPath, defaultTheme, defaultLang, showStats: propShowStats, showOutline: propShowOutline, showProperties: propShowProperties, initialSettings, initialFiles, onSelect: propOnSelect, onLoad, hideDeleteModel }: ThreeViewerProps) => import("react/jsx-runtime").JSX.Element;
export default ThreeViewer;
