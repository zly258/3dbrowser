import { useCallback } from "react";
import type { RefObject } from "react";
import type { SceneManager, SceneSettings } from "../utils/SceneManager";
import type { TFunc } from "../theme/Locales";
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
        await loadSceneItems({
            items,
            manager: managerRef.current,
            sceneSettings,
            libPath,
            t,
            onProgress: (p, msg) => {
                setProgress(p);
                if (msg) setStatus(cleanLoadingStatus(msg));
            }
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
            setStatus(t("success"));
            managerRef.current?.fitView(false);
        } catch (err) {
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: "error" });
        } finally {
            setLoading(false);
        }
    }, [loadItemsIntoScene, managerRef, setCurrentFileSetId, setLoading, setProgress, setStatus, setToast, t, updateTree]);

    return {
        processFiles,
        loadItemsIntoScene
    };
}
