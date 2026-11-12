import { useCallback } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { SceneManager, SceneSettings } from "../utils/scene-manager/SceneManager";
import type { PropertyGroups } from "../viewer/propertyIndex";
import type { ViewerToast } from "../viewer/types";
import type { LoadedFileFailure } from "../loader/loaderUtils";
import { loadModelFiles } from "../loader/loaderUtils";
import { cleanLoadingStatus, formatFailures } from "../viewer/fileLoading";
import { buildNbimBlobFromObjects, downloadNbimBlob } from "../utils/scene-manager/nbimBatchConvert";
import type { ViewerTool } from "./useViewerTools";

interface UseViewerFileActionsOptions {
    sceneMgrRef: RefObject<SceneManager | null>;
    sceneSettings: SceneSettings;
    libPath: string;
    t: (key: string) => string;
    processFiles: (items: (File | string)[]) => Promise<void>;
    loadItemsIntoScene: (items: (File | string)[]) => Promise<LoadedFileFailure[]>;
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
    sceneSettings,
    libPath,
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
        if (!event.target.files?.length) return;

        const files = Array.from(event.target.files) as File[];
        event.target.value = "";

        const invalidFiles = files.filter((file) => file.name.toLowerCase().endsWith(".nbim"));
        if (invalidFiles.length > 0) {
            setToast({ message: t("unsupported_format"), type: "info" });
            return;
        }

        setLoading(true);
        setStatus(`${t("processing")}...`);
        setProgress(0);
        setActiveTool("none");

        let loadedObjects: any[] = [];
        try {
            const failures: LoadedFileFailure[] = [];
            const runtimeHints = (manager as any)?.getChunkOptions?.() || {};
            loadedObjects = await loadModelFiles(
                files,
                (p, msg) => {
                    setProgress(Math.min(60, Math.round(p * 0.6)));
                    if (msg) setStatus(cleanLoadingStatus(msg));
                },
                t,
                sceneSettings,
                libPath,
                {
                    loadProfile: runtimeHints.loadProfile ?? "max-speed",
                    deferIfcProperties: runtimeHints.deferIfcProperties ?? true,
                    fastGeometrySanitize: runtimeHints.fastGeometrySanitize ?? true,
                    onFileFailure: (failure) => failures.push(failure)
                }
            );

            if (failures.length > 0) {
                setToast({ message: formatFailures(failures, t("failed")), type: "error" });
                return;
            }
            if (loadedObjects.length === 0) {
                throw new Error(t("load_parse_failed"));
            }

            setStatus(`${t("processing")}...`);
            const { blob, fileName } = await buildNbimBlobFromObjects({
                objects: loadedObjects,
                fileNames: files.map((file) => file.name),
                onProgress: (p, msg) => {
                    setProgress(60 + Math.round(p * 0.4));
                    if (msg) setStatus(msg);
                }
            });

            downloadNbimBlob(blob, fileName);
            setStatus(t("success"));
            setToast({ message: t("success"), type: "success" });
        } catch (error) {
            console.error("[ThreeViewer] handleBatchConvert error:", error);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
        } finally {
            // 批量转换是“无头”的：不进入场景、不占 GPU，结束后释放临时几何。
            for (const object of loadedObjects) {
                object.traverse((child: any) => {
                    if (child?.isMesh) {
                        child.geometry?.dispose?.();
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach((material: any) => material?.dispose?.());
                    }
                });
            }
            setLoading(false);
        }
    }, [
        libPath,
        sceneMgrRef,
        sceneSettings,
        setActiveTool,
        setLoading,
        setProgress,
        setStatus,
        setToast,
        t
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
