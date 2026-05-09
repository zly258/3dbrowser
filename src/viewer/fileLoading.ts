import { loadModelFiles } from "../loader/loaderUtils";
import { SceneSettings, SceneManager } from "../utils/scene-manager/SceneManager";
import { TFunc } from "../theme/locales";
import type { LoaderRuntimeHints } from "../loader/loaderUtils";

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
}

export async function loadSceneItems({
    items,
    manager,
    sceneSettings,
    libPath,
    t,
    onProgress,
    runtimeHints = {},
    isStale
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
        if (typeof item === "string") {
            const response = await fetch(item);
            if (!response.ok) throw new Error(`HTTP ${response.status} when fetching NBIM`);
            const blob = await response.blob();
            const fileName = item.split("?")[0].split("#")[0].split("/").pop() || "model.nbim";
            const file = new File([blob], fileName);
            await (manager as any).loadNbim(file, (p: number, msg: string) => {
                onProgress(p, msg);
            });
        } else {
            await (manager as any).loadNbim(item, (p: number, msg: string) => {
                onProgress(p, msg);
            });
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
            isStale
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
                throw new Error(`${obj.name || "Model"} has no renderable mesh`);
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
