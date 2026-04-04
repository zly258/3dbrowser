import { useCallback, useEffect, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SceneManager } from "../utils/SceneManager";
import type { ViewpointRecord, ViewerConfirmState, ViewerToast } from "../viewer/types";

interface UseViewpointsOptions {
    currentFileSetId: string;
    sceneMgrRef: RefObject<SceneManager | null>;
    setToast: Dispatch<SetStateAction<ViewerToast | null>>;
    setConfirmState: Dispatch<SetStateAction<ViewerConfirmState>>;
    t: (key: string) => string;
}

export function useViewpoints({
    currentFileSetId,
    sceneMgrRef,
    setToast,
    setConfirmState,
    t
}: UseViewpointsOptions) {
    const [viewpoints, setViewpoints] = useState<ViewpointRecord[]>([]);

    useEffect(() => {
        if (!currentFileSetId) {
            setViewpoints([]);
            return;
        }

        try {
            const saved = localStorage.getItem(`viewpoints_${currentFileSetId}`);
            setViewpoints(saved ? JSON.parse(saved) as ViewpointRecord[] : []);
        } catch (error) {
            console.error("Failed to load viewpoints", error);
            setViewpoints([]);
        }
    }, [currentFileSetId]);

    const persistViewpoints = useCallback((nextViewpoints: ViewpointRecord[]) => {
        if (!currentFileSetId) return;
        setViewpoints(nextViewpoints);
        try {
            localStorage.setItem(`viewpoints_${currentFileSetId}`, JSON.stringify(nextViewpoints));
        } catch (error) {
            console.error("Failed to persist viewpoints", error);
        }
    }, [currentFileSetId]);

    const captureViewThumbnail = useCallback(() => {
        const manager = sceneMgrRef.current;
        if (!manager) return "";

        try {
            manager.renderer.render(manager.scene, manager.camera);
            const srcCanvas = manager.canvas;
            const scale = Math.min(640 / srcCanvas.width, 360 / srcCanvas.height);
            const dstWidth = Math.round(srcCanvas.width * scale);
            const dstHeight = Math.round(srcCanvas.height * scale);

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = dstWidth;
            tempCanvas.height = dstHeight;
            const context = tempCanvas.getContext("2d");
            if (!context) return "";

            context.drawImage(srcCanvas, 0, 0, dstWidth, dstHeight);
            return tempCanvas.toDataURL("image/jpeg", 0.92);
        } catch (error) {
            console.error("Failed to capture thumbnail", error);
            return "";
        }
    }, [sceneMgrRef]);

    const handleSaveViewpoint = useCallback((customName?: string, replaceId?: string) => {
        const manager = sceneMgrRef.current;
        if (!manager || !currentFileSetId) {
            setToast({ message: t("no_models"), type: "info" });
            return;
        }

        if (manager.contentGroup.children.length === 0) {
            setToast({ message: t("no_models"), type: "info" });
            return;
        }

        const name = customName || `${t("viewpoint_title")} ${viewpoints.length + 1}`;
        const cameraState = manager.getCameraState();
        const image = captureViewThumbnail();
        const nextViewpoints = replaceId
            ? viewpoints.map((viewpoint) => viewpoint.id === replaceId ? { ...viewpoint, name, cameraState, image } : viewpoint)
            : [...viewpoints, { id: Date.now().toString(), name, cameraState, image }];

        persistViewpoints(nextViewpoints);
        setToast({ message: t("success"), type: "success" });
    }, [captureViewThumbnail, currentFileSetId, persistViewpoints, sceneMgrRef, setToast, t, viewpoints]);

    const handleUpdateViewpointName = useCallback((id: string, newName: string) => {
        persistViewpoints(viewpoints.map((viewpoint) => viewpoint.id === id ? { ...viewpoint, name: newName } : viewpoint));
    }, [persistViewpoints, viewpoints]);

    const handleLoadViewpoint = useCallback((viewpoint: ViewpointRecord) => {
        if (!viewpoint.cameraState) return;
        sceneMgrRef.current?.setCameraState(viewpoint.cameraState);
        setToast({ message: `${t("viewpoint_loading")}: ${viewpoint.name}`, type: "info" });
    }, [sceneMgrRef, setToast, t]);

    const handleOverwriteViewpoint = useCallback((id: string) => {
        const viewpoint = viewpoints.find((item) => item.id === id);
        if (!viewpoint) return;
        handleSaveViewpoint(viewpoint.name, id);
    }, [handleSaveViewpoint, viewpoints]);

    const handleDeleteViewpoint = useCallback((id: string) => {
        const viewpoint = viewpoints.find((item) => item.id === id);
        setConfirmState({
            isOpen: true,
            title: t("viewpoint_title"),
            message: `${t("confirm_delete")} "${viewpoint?.name || "Viewpoint"}"?`,
            action: () => {
                persistViewpoints(viewpoints.filter((item) => item.id !== id));
            }
        });
    }, [persistViewpoints, setConfirmState, t, viewpoints]);

    return {
        viewpoints,
        handleSaveViewpoint,
        handleUpdateViewpointName,
        handleLoadViewpoint,
        handleOverwriteViewpoint,
        handleDeleteViewpoint
    };
}
