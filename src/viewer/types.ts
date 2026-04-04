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

export interface ViewpointRecord {
    id: string;
    name: string;
    cameraState: ReturnType<SceneManager["getCameraState"]>;
    image: string;
}
