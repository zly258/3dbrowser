import { useCallback } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { PropertyGroups } from "../viewer/propertyIndex";
import type { ViewerToast } from "../viewer/types";
import type { ViewerTool } from "./useViewerTools";

interface UseViewerFileActionsOptions {
    sceneMgrRef: RefObject<SceneManager | null>;
    t: (key: string) => string;
    processFiles: (items: (File | string)[]) => Promise<void>;
    loadItemsIntoScene: (items: (File | string)[]) => Promise<void>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setProgress: Dispatch<SetStateAction<number>>;
    setToast: Dispatch<SetStateAction<ViewerToast | null>>;
    setActiveTool: Dispatch<SetStateAction<ViewerTool>>;
    setSelectedUuids: Dispatch<SetStateAction<string[]>>;
    setSelectedProps: Dispatch<SetStateAction<PropertyGroups | null>>;
    resetMeasurementState: () => void;
    updateTree: () => void;
    isDev: boolean;
}

const SUPPORTED_DROP_EXTENSIONS = [
    ".lmb",
    ".glb",
    ".gltf",
    ".ifc",
    ".nbim",
    ".fbx",
    ".obj",
    ".stl",
    ".ply",
    ".3mf",
    ".stp",
    ".step",
    ".igs",
    ".iges"
];

export function useViewerFileActions({
    sceneMgrRef,
    t,
    processFiles,
    loadItemsIntoScene,
    setLoading,
    setStatus,
    setProgress,
    setToast,
    setActiveTool,
    setSelectedUuids,
    setSelectedProps,
    resetMeasurementState,
    updateTree,
    isDev
}: UseViewerFileActionsOptions) {
    const handleOpenFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.length) return;
        await processFiles(Array.from(event.target.files) as File[]);
        event.target.value = "";
    }, [processFiles]);

    const handleBatchConvert = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const manager = sceneMgrRef.current;
        if (!event.target.files?.length || !manager) return;

        const files = Array.from(event.target.files) as File[];
        event.target.value = "";

        const invalidFiles = files.filter((file) => file.name.toLowerCase().endsWith(".nbim"));
        if (invalidFiles.length > 0) {
            setToast({ message: t("unsupported_format"), type: "info" });
            return;
        }

        (manager as any).setChunkLoadingEnabled?.(false);
        (manager as any).setContentVisible?.(false);

        setLoading(true);
        setStatus(`${t("processing")}...`);
        setProgress(0);
        setActiveTool("none");

        try {
            await manager.clear();
            setSelectedUuids([]);
            setSelectedProps(null);
            resetMeasurementState();
            updateTree();

            await loadItemsIntoScene(files);
            updateTree();

            setStatus(`${t("processing")}...`);
            await manager.exportNbim();
            setStatus(t("success"));
            setToast({ message: t("success"), type: "success" });
        } catch (error) {
            console.error("[ThreeViewer] handleBatchConvert error:", error);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
        } finally {
            try {
                await sceneMgrRef.current?.clear();
                updateTree();
            } catch {}
            (sceneMgrRef.current as any)?.setChunkLoadingEnabled?.(true);
            (sceneMgrRef.current as any)?.setContentVisible?.(true);
            setLoading(false);
        }
    }, [
        loadItemsIntoScene,
        resetMeasurementState,
        sceneMgrRef,
        setActiveTool,
        setLoading,
        setProgress,
        setSelectedProps,
        setSelectedUuids,
        setStatus,
        setToast,
        t,
        updateTree
    ]);

    const handleOpenUrl = useCallback(async () => {
        const url = window.prompt(t("menu_open_url"), "http://");
        if (!url || !url.startsWith("http")) return;

        if (isDev) {
            console.log("[ThreeViewer] handleOpenUrl called with:", url);
        }

        setLoading(true);
        setStatus(`${t("processing")}...`);
        try {
            await processFiles([url]);
        } catch (error) {
            console.error("[ThreeViewer] handleOpenUrl error:", error);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
        } finally {
            setLoading(false);
        }
    }, [isDev, processFiles, setLoading, setStatus, setToast, t]);

    const handleDragOver = useCallback((event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (!event.dataTransfer.files?.length) return;

        const files = Array.from(event.dataTransfer.files) as File[];
        const validFiles = files.filter((file) => {
            const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
            return SUPPORTED_DROP_EXTENSIONS.includes(extension);
        });

        if (validFiles.length < files.length) {
            setToast({ message: t("unsupported_format"), type: "info" });
        }

        if (validFiles.length > 0) {
            await processFiles(validFiles);
        }
    }, [processFiles, setToast, t]);

    return {
        handleOpenFiles,
        handleBatchConvert,
        handleOpenUrl,
        handleDragOver,
        handleDrop
    };
}
