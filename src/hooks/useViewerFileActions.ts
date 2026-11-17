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
import { releaseIfcRuntime } from "../loader/ifcRelease";
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

        const failures: LoadedFileFailure[] = [];
        let successCount = 0;
        const totalFiles = files.length;
        const runtimeHints = (manager as any)?.getChunkOptions?.() || {};

        try {
            // 逐个文件依次进行无头转换：每处理完一个文件立即释放内存与 WASM 句柄，
            // 避免多个大 IFC 同时驻留内存引发 OOM 或主线程在组装/下载时卡死在 100%。
            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                const fileBase = (i / totalFiles) * 100;
                const fileWeight = 100 / totalFiles;
                let singleObjects: any[] = [];

                try {
                    singleObjects = await loadModelFiles(
                        [file],
                        (p, msg) => {
                            const cur = Math.round(fileBase + (p * 0.45 / 100) * fileWeight);
                            setProgress(Math.min(99, cur));
                            if (msg) setStatus(`[${i + 1}/${totalFiles}] ${cleanLoadingStatus(msg)}`);
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

                    if (singleObjects.length === 0) {
                        failures.push({ fileName: file.name, message: t("load_parse_failed") });
                        continue;
                    }

                    const { fileBlob, fileName } = await buildNbimBlobFromObjects({
                        objects: singleObjects,
                        fileNames: [file.name],
                        onProgress: (p, msg) => {
                            const cur = Math.round(fileBase + ((45 + p * 0.55) / 100) * fileWeight);
                            setProgress(Math.min(99, cur));
                            if (msg) setStatus(`[${i + 1}/${totalFiles}] ${msg}`);
                        }
                    });

                    // 转换完当前文件立即触发下载
                    downloadNbimBlob(fileBlob, fileName);
                    successCount++;
                } catch (err) {
                    console.error(`[ThreeViewer] 批量转换文件 ${file.name} 失败:`, err);
                    failures.push({ fileName: file.name, message: (err as Error)?.message || String(err) });
                } finally {
                    // 立即释放当前文件的几何与 WASM 内存
                    for (const object of singleObjects) {
                        object.traverse((child: any) => {
                            if (child?.isMesh) {
                                child.geometry?.dispose?.();
                                const materials = Array.isArray(child.material) ? child.material : [child.material];
                                materials.forEach((material: any) => material?.dispose?.());
                            }
                        });
                        releaseIfcRuntime(object);
                    }
                    singleObjects = [];
                    // 让出主线程，供浏览器垃圾回收并响应 UI
                    await new Promise<void>((resolve) => setTimeout(resolve, 60));
                }
            }

            if (failures.length > 0 && successCount === 0) {
                setStatus(t("failed"));
                setToast({ message: formatFailures(failures, t("failed")), type: "error" });
            } else if (failures.length > 0) {
                setProgress(100);
                setStatus(t("success"));
                setToast({
                    message: `${t("success")} (${successCount}/${totalFiles}), ${failures.length} 个失败`,
                    type: "info"
                });
            } else {
                setProgress(100);
                setStatus(t("success"));
                setToast({ message: t("success"), type: "success" });
            }
        } catch (error) {
            console.error("[ThreeViewer] handleBatchConvert 总体异常:", error);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
        } finally {
            // 延时清除遮罩与进度，避免闪烁或卡在 100%
            window.setTimeout(() => {
                setLoading(false);
                setProgress(0);
            }, 350);
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
