import * as THREE from "three";
import { TFunc, ProgressCallback } from "../theme/Locales";
import { SceneSettings } from "../utils/SceneManager";
export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}
export declare const loadModelFiles: (files: (File | string)[], onProgress: ProgressCallback, t: TFunc, _settings: SceneSettings, libPath?: string) => Promise<THREE.Object3D[]>;
export declare const parseTilesetFromFolder: (files: FileList, onProgress: ProgressCallback, t: TFunc) => Promise<string | null>;
