import { loadModelFiles } from "../loader/loaderUtils";
import type { LoadedFileFailure } from "../loader/loaderUtils";
import type { SceneSettings, SceneManager } from "../utils/scene-manager/SceneManager";
import { TFunc } from "../theme/locales";
import type { LoaderRuntimeHints } from "../loader/loaderUtils";

export type { LoadedFileFailure };

export function formatFailureList(failures: LoadedFileFailure[], maxShown = 3) {
    if (!failures.length) return "";
    const shown = failures.slice(0, maxShown)
        .map((failure) => `${failure.fileName}: ${failure.message}`)
        .join("; ");
    const rest = failures.length - maxShown;
    return rest > 0 ? `${shown} (+${rest})` : shown;
}

export function formatFailures(failures: LoadedFileFailure[], failedLabel: string) {
    return `${failedLabel} (${failures.length}): ${formatFailureList(failures)}`;
}

export function cleanLoadingStatus(message: string) {
    if (!message) return "";
    return message
        .replace(/:\s*\d+%/g, "")
        .replace(/\(\d+%\)/g, "")
        .replace(/\d+%/g, "")
        .trim();
}

export function createFileSetId(items: (File | string)[]) {
    const names = items.map((item) => typeof item === "string" ? item : item.name).sort();
    return names.join("|");
}

interface LoadSceneItemsArgs {
    items: (File | string)[];
    manager: SceneManager;
    sceneSettings: SceneSettings;
    libPath: string;
    t: TFunc;
    onProgress: (progress: number, message?: string) => void;
    runtimeHints?: LoaderRuntimeHints;
    isStale?: () => boolean;
    onFileFailure?: (failure: LoadedFileFailure) => void;
}

export async function loadSceneItems({
    items,
    manager,
    sceneSettings,
    libPath,
    t,
    onProgress,
    runtimeHints = {},
    isStale,
    onFileFailure
}: LoadSceneItemsArgs) {
    if (!items.length) return;

    const nbimItems: (File | string)[] = [];
    const otherItems: (File | string)[] = [];

    for (const item of items) {
        const path = typeof item === "string" ? item.split("?")[0].split("#")[0] : item.name;
        if (path.toLowerCase().endsWith(".nbim")) {
            nbimItems.push(item);
        } else {
            otherItems.push(item);
        }
    }

    for (const item of nbimItems) {
        if (isStale?.()) return;
        const displayName = typeof item === "string"
            ? (item.split("?")[0].split("#")[0].split("/").pop() || item)
            : item.name;
        try {
            if (typeof item === "string") {
                const response = await fetch(item);
                if (!response.ok) throw new Error(`HTTP ${response.status} when fetching NBIM`);
                const blob = await response.blob();
                const fileName = displayName;
                const file = new File([blob], fileName);
                await (manager as any).loadNbim(file, (p: number, msg: string) => {
                    onProgress(p, msg);
                });
            } else {
                await (manager as any).loadNbim(item, (p: number, msg: string) => {
                    onProgress(p, msg);
                });
            }
        } catch (error) {
            const message = (error as Error)?.message || String(error);
            console.error(`加载 ${displayName} 失败`, error);
            if (onFileFailure) {
                onFileFailure({ fileName: displayName, message });
            } else {
                throw error;
            }
        }
    }

    if (otherItems.length === 0) return;

    const loadedObjects = await loadModelFiles(
        otherItems,
        onProgress,
        t,
        sceneSettings,
        libPath,
        {
            ...runtimeHints,
            isStale,
            onFileFailure
        }
    );

    const totalObjects = Math.max(loadedObjects.length, 1);
    for (let index = 0; index < loadedObjects.length; index++) {
        if (isStale?.()) return;
        const obj = loadedObjects[index];
        const objectBase = 92 + Math.round((index / totalObjects) * 8);
        try {
            let meshCount = 0;
            obj.traverse((child: any) => {
                if (child?.isMesh && child.geometry) meshCount++;
            });
            if (meshCount <= 0) {
                throw new Error(`${obj.name || "Model"}: ${t("load_no_renderable_mesh")}`);
            }

            await manager.addModel(obj, (p: number, msg: string) => {
                const stagedProgress = Math.min(100, objectBase + Math.round((p / 100) * (8 / totalObjects)));
                onProgress(stagedProgress, msg);
            });
        } catch (error) {
            try {
                await manager.removeModel(obj.uuid);
            } catch {
            }
            throw error;
        }
        manager.invalidateRender?.({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
    }
}
