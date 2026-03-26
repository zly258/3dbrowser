import React from "react";
import { SceneManager } from "../utils/SceneManager";
import { Lang } from "../theme/Locales";
import { ThemeColors } from "../theme/Styles";
interface ViewCubeProps {
    sceneMgr: SceneManager | null;
    lang?: Lang;
    theme?: ThemeColors;
}
export declare const ViewCube: React.FC<ViewCubeProps>;
export {};
