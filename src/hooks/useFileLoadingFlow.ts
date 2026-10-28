import { useCallback } from "react";
import type { RefObject } from "react";
import type { SceneManager, SceneSettings } from "../utils/scene-manager/SceneManager";
import type { TFunc } from "../theme/locales";
import type { LoadedFileFailure } from "../loader/loaderUtils";
import {
    cleanLoadingStatus,
    createFileSetId,
    formatFailureList,
    formatFailures,
    loadSceneItems
} from "../viewer/fileLoading";

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
        if (!items.length || !managerRef.current) return [] as LoadedFileFailure[];
        const manager = managerRef.current;
        const generation = manager.beginLoadGeneration?.() ?? 0;
        const runtimeHints = (manager as any).getChunkOptions?.() || {};
        const failures: LoadedFileFailure[] = [];
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
            isStale: () => !(managerRef.current?.isLoadGenerationCurrent?.(generation)),
            onFileFailure: (failure) => {
                failures.push(failure);
            }
        });
        manager.invalidateRender?.({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
        if (
            failures.length > 0 &&
            failures.length >= items.length &&
            managerRef.current?.isLoadGenerationCurrent?.(generation) !== false
        ) {
            throw new Error(formatFailureList(failures));
        }
        return failures;
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
            const failures = await loadItemsIntoScene(items);
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
                    throw new Error(`${items.map((item) => typeof item === "string" ? item : item.name).join(", ")}: ${t("load_no_renderable_mesh")}`);
                }
            } else {
                managerRef.current?.fitView(false);
            }
            managerRef.current?.invalidateRender?.({
                invalidateInteractables: true,
                needsBoundsUpdate: true,
                needsCulling: true
            });
            if (failures.length > 0) {
                setStatus(t("failed"));
                setToast({ message: formatFailures(failures, t("failed")), type: "error" });
            } else {
                setStatus(t("success"));
            }
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
