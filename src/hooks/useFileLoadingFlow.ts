import { useCallback } from "react";
import type { RefObject } from "react";
import type { SceneManager, SceneSettings } from "../utils/scene-manager/SceneManager";
import type { TFunc } from "../theme/locales";
import { cleanLoadingStatus, createFileSetId, loadSceneItems } from "../viewer/fileLoading";

interface FileLoadingFlowOptions {
    managerRef: RefObject<SceneManager | null>;
    sceneSettings: SceneSettings;
    libPath: string;
    t: TFunc;
    setCurrentFileSetId: (id: string) => void;
    setLoading: (loading: boolean) => void;
    setStatus: (status: string) => void;
    setProgress: (progress: number) => void;
    setToast: (toast: { message: string; type: "success" | "error" | "info" } | null) => void;
    updateTree: () => void;
}

export function useFileLoadingFlow({
    managerRef,
    sceneSettings,
    libPath,
    t,
    setCurrentFileSetId,
    setLoading,
    setStatus,
    setProgress,
    setToast,
    updateTree
}: FileLoadingFlowOptions) {
    const loadItemsIntoScene = useCallback(async (items: (File | string)[]) => {
        if (!items.length || !managerRef.current) return;
        const manager = managerRef.current;
        const generation = manager.beginLoadGeneration?.() ?? 0;
        const runtimeHints = (manager as any).getChunkOptions?.() || {};
        await loadSceneItems({
            items,
            manager,
            sceneSettings,
            libPath,
            t,
            onProgress: (p, msg) => {
                setProgress(p);
                if (msg) setStatus(cleanLoadingStatus(msg));
                manager.invalidateRender?.();
            },
            runtimeHints,
            isStale: () => !(managerRef.current?.isLoadGenerationCurrent?.(generation))
        });
        manager.invalidateRender?.({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
    }, [libPath, managerRef, sceneSettings, setProgress, setStatus, t]);

    const processFiles = useCallback(async (items: (File | string)[]) => {
        if (!items.length || !managerRef.current) return;
        const setId = createFileSetId(items);
        setCurrentFileSetId(setId);

        (managerRef.current as any).setChunkLoadingEnabled?.(true);
        (managerRef.current as any).setContentVisible?.(true);
        setLoading(true);
        setStatus(t("loading"));
        setProgress(0);

        try {
            await loadItemsIntoScene(items);
            updateTree();
            managerRef.current?.invalidateRender?.({
                invalidateInteractables: true,
                needsBoundsUpdate: true,
                needsCulling: true
            });
            const hasNbim = items.some((item) => {
                const path = typeof item === "string" ? item : item.name;
                return path.toLowerCase().endsWith(".nbim");
            });
            if (hasNbim) {
                const stats = managerRef.current.getStats?.();
                if (stats && stats.meshes <= 0) {
                    throw new Error("NBIM 加载完成但没有可渲染外形，请检查文件格式或分块数据");
                }
            } else {
                managerRef.current?.fitView(false);
            }
            managerRef.current?.invalidateRender?.({
                invalidateInteractables: true,
                needsBoundsUpdate: true,
                needsCulling: true
            });
            setStatus(t("success"));
        } catch (err) {
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: "error" });
        } finally {
            setLoading(false);
            managerRef.current?.invalidateRender?.();
        }
    }, [loadItemsIntoScene, managerRef, setCurrentFileSetId, setLoading, setProgress, setStatus, setToast, t, updateTree]);

    return {
        processFiles,
        loadItemsIntoScene
    };
}
