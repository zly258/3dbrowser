import { useCallback } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import { exportGLB } from "../utils/converter";
import { sanitizeFileStem, stripFileExtension } from "../viewer/exportNaming";
import { cleanLoadingStatus } from "../viewer/fileLoading";
import type { PropertyGroups } from "../viewer/propertyIndex";
import type { ViewerConfirmState, ViewerToast } from "../viewer/types";
import type { ViewerTool } from "./useViewerTools";

interface UseViewerActionsOptions {
    sceneMgrRef: RefObject<SceneManager | null>;
    t: (key: string) => string;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setProgress: Dispatch<SetStateAction<number>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setToast: Dispatch<SetStateAction<ViewerToast | null>>;
    setActiveTool: Dispatch<SetStateAction<ViewerTool>>;
    setConfirmState: Dispatch<SetStateAction<ViewerConfirmState>>;
    setSelectedUuids: Dispatch<SetStateAction<string[]>>;
    setSelectedProps: Dispatch<SetStateAction<PropertyGroups | null>>;
    setChunkProgress: Dispatch<SetStateAction<{ loaded: number; total: number }>>;
    resetLocateState: () => void;
    clearSearchResult: () => void;
    resetClashState: () => void;
    resetMeasurementState: () => void;
    resetExplodeState: () => void;
    updateTree: () => void;
    ifcPropertyCacheRef: MutableRefObject<Map<string, Record<string, unknown>>>;
    completedFileSetsRef: MutableRefObject<Set<string>>;
}

export function useViewerActions({
    sceneMgrRef,
    t,
    setLoading,
    setProgress,
    setStatus,
    setToast,
    setActiveTool,
    setConfirmState,
    setSelectedUuids,
    setSelectedProps,
    setChunkProgress,
    resetLocateState,
    clearSearchResult,
    resetClashState,
    resetMeasurementState,
    resetExplodeState,
    updateTree,
    ifcPropertyCacheRef,
    completedFileSetsRef
}: UseViewerActionsOptions) {
    const getExportModelNames = useCallback(() => {
        const manager = sceneMgrRef.current;
        if (!manager) return [] as string[];

        const names: string[] = [];
        manager.contentGroup.children.forEach((child: THREE.Object3D) => {
            if (child.userData?.isOptimizedGroup) return;
            if (child.name.startsWith("optimized_")) return;

            const rawName =
                (typeof child.userData?.modelName === "string" ? child.userData.modelName : "") ||
                (child.children?.[0]?.name || "") ||
                child.name;
            const baseName = sanitizeFileStem(stripFileExtension(rawName));
            if (baseName) names.push(baseName);
        });

        return Array.from(new Set(names));
    }, [sceneMgrRef]);

    const getDefaultExportFileName = useCallback((format: string) => {
        const modelNames = getExportModelNames();
        if (modelNames.length === 1) {
            return modelNames[0];
        }

        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, "0");
        const suffix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `${t("export_batch_name")}_${suffix}`;
    }, [getExportModelNames, t]);

    const resolveExportFilename = useCallback((format: string, requestedName?: string) => {
        const fallback = getDefaultExportFileName(format);
        const stem = sanitizeFileStem(stripFileExtension((requestedName || "").trim()) || fallback);
        return `${stem}.${format}`;
    }, [getDefaultExportFileName]);

    const handleExport = useCallback(async (format: string, requestedName: string) => {
        const manager = sceneMgrRef.current;
        if (!manager) return;

        const content = manager.contentGroup;
        const resolvedFileName = resolveExportFilename(format, requestedName);
        const resolvedStem = stripFileExtension(resolvedFileName);

        if (format === "nbim") {
            if (content.children.length === 0) {
                setToast({ message: t("no_models"), type: "info" });
                return;
            }

            // 先重置进度再进入导出：否则界面会沿用上一次加载残留的 100%，
            // 看起来就像“卡死在 100% 不动”。
            setLoading(true);
            setProgress(0);
            setStatus(`${t("processing")}...`);
            setActiveTool("none");
            window.setTimeout(async () => {
                try {
                    await sceneMgrRef.current?.exportNbim(resolvedStem, (p, msg) => {
                        setProgress(p);
                        if (msg) setStatus(msg);
                    });
                    setProgress(100);
                    setToast({ message: t("success"), type: "success" });
                } catch (error) {
                    console.error(error);
                    setProgress(0);
                    setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
                } finally {
                    setLoading(false);
                    setProgress(0);
                }
            }, 100);
            return;
        }

        const modelsToExport = content.children.filter((child: THREE.Object3D) => !child.userData.isOptimizedGroup);
        if (modelsToExport.length === 0) {
            setToast({ message: t("no_models"), type: "info" });
            return;
        }

        if (format !== "glb") {
            setToast({ message: `${t("unsupported_format")} (.${format})`, type: "info" });
            return;
        }

        // 克隆整场景是同步的重活：先亮出进度条，再在下一帧做克隆，
        // 避免用户点“导出”后界面无任何反馈地停顿数秒。
        setLoading(true);
        setProgress(0);
        setStatus(`${t("processing")}...`);
        setActiveTool("none");

        window.setTimeout(async () => {
            let exportGroup: THREE.Group | null = null;
            try {
                setProgress(5);
                exportGroup = new THREE.Group();
                modelsToExport.forEach((model: THREE.Object3D) => exportGroup!.add(model.clone()));

                let blob: Blob | null = await exportGLB(exportGroup);
                setProgress(90);

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = resolvedFileName;
                    anchor.click();
                    // 立即回收会中断大文件下载
                    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                    setProgress(100);
                    setToast({ message: t("success"), type: "success" });
                } else {
                    setToast({ message: `${t("failed")}: ${format}`, type: "error" });
                }
            } catch (error) {
                console.error(error);
                setToast({ message: `${t("failed")}: ${(error as Error).message}`, type: "error" });
            } finally {
                // 清空临时组节点引用，注意不可销毁几何/材质，因为 Object3D.clone() 共享了原场景资源
                exportGroup?.clear();
                exportGroup = null;
                setLoading(false);
                setProgress(0);
            }
        }, 100);
    }, [resolveExportFilename, sceneMgrRef, setActiveTool, setLoading, setProgress, setStatus, setToast, t]);

    const handleClear = useCallback(async () => {
        const manager = sceneMgrRef.current;
        if (!manager) return;

        setConfirmState({
            isOpen: true,
            title: t("op_clear"),
            message: t("confirm_clear"),
            action: async () => {
                setLoading(true);
                setProgress(0);
                setStatus(`${t("op_clear")}...`);

                try {
                    await sceneMgrRef.current?.clear();
                    setSelectedUuids([]);
                    resetLocateState();
                    setSelectedProps(null);
                    clearSearchResult();
                    resetClashState();
                    ifcPropertyCacheRef.current.clear();
                    resetMeasurementState();
                    setChunkProgress({ loaded: 0, total: 0 });
                    completedFileSetsRef.current.clear();
                    resetExplodeState();
                    updateTree();
                    setStatus(t("ready"));
                } catch (error) {
                    console.error("清空场景失败:", error);
                } finally {
                    setLoading(false);
                    setProgress(0);
                }
            }
        });
    }, [
        clearSearchResult,
        completedFileSetsRef,
        ifcPropertyCacheRef,
        resetClashState,
        resetExplodeState,
        resetLocateState,
        resetMeasurementState,
        sceneMgrRef,
        setChunkProgress,
        setConfirmState,
        setLoading,
        setProgress,
        setSelectedProps,
        setSelectedUuids,
        setStatus,
        t,
        updateTree
    ]);

    const handleScreenshot = useCallback((mode: "scene" | "transparent" = "scene") => {
        const manager = sceneMgrRef.current;
        if (!manager) return;

        try {
            const renderer = manager.renderer;
            const scene = manager.scene;
            const previousBackground = scene.background;

            if (mode === "transparent") {
                scene.background = null;
                renderer.setClearAlpha(0);
            } else {
                renderer.setClearAlpha(1);
            }

            renderer.render(scene, manager.camera);
            const dataUrl = manager.canvas.toDataURL("image/png");
            const anchor = document.createElement("a");
            anchor.href = dataUrl;
            anchor.download = mode === "transparent" ? "screenshot-transparent.png" : "screenshot.png";
            anchor.click();

            scene.background = previousBackground;
            renderer.setClearAlpha(1);
            renderer.render(scene, manager.camera);
            setToast({ message: t("success"), type: "success" });
        } catch (error) {
            console.error(error);
            setToast({ message: t("failed"), type: "error" });
        }
    }, [sceneMgrRef, setToast, t]);

    return {
        getDefaultExportFileName,
        handleExport,
        handleClear,
        handleScreenshot
    };
}
