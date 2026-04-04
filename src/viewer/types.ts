import type { SceneManager } from "../utils/SceneManager";

export interface ViewerToast {
    message: string;
    type: "success" | "error" | "info";
}

export interface ViewerErrorState {
    isOpen: boolean;
    title: string;
    message: string;
    detail?: string;
}

export interface ViewerConfirmState {
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
}

export interface ViewpointSaveOptions {
    visibility: boolean;
    selection: boolean;
    clip: boolean;
    explode: boolean;
}

export interface ViewpointStateSnapshot {
    hiddenUuids?: string[];
    isolatedUuids?: string[];
    selectedUuids?: string[];
    clip?: {
        enabled: boolean;
        values: {
            x: number[];
            y: number[];
            z: number[];
        };
        active: {
            x: boolean;
            y: boolean;
            z: boolean;
        };
        helperVisible: boolean;
        helperOpacity: number;
    };
    explode?: {
        enabled: boolean;
        strength: number;
        mode: "radial" | "horizontal" | "vertical";
    };
}

export interface ViewpointRecord {
    id: string;
    name: string;
    cameraState: ReturnType<SceneManager["getCameraState"]>;
    image: string;
    saveOptions?: ViewpointSaveOptions;
    stateSnapshot?: ViewpointStateSnapshot;
}
