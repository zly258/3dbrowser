export type GhostMode = "visible-first" | "all";
export type PerformancePreset = "balanced" | "smooth" | "quality";
export type LoadProfile = "max-speed" | "balanced";

export interface SceneChunkOptions {
    chunkReadCacheSize?: number;
    chunkPrefetchWindow?: number;
    ghostMode?: GhostMode;
    targetMinFps?: number;
    loadProfile?: LoadProfile;
    deferIfcProperties?: boolean;
    preferWorkerOctree?: boolean;
    fastGeometrySanitize?: boolean;
}

export interface SceneManagerOptions {
    performancePreset?: PerformancePreset;
    chunkOptions?: SceneChunkOptions;
}

export interface ResolvedSceneChunkOptions {
    chunkReadCacheSize: number;
    chunkPrefetchWindow: number;
    ghostMode: GhostMode;
    targetMinFps: number;
    loadProfile: LoadProfile;
    deferIfcProperties: boolean;
    preferWorkerOctree: boolean;
    fastGeometrySanitize: boolean;
}

export const DEFAULT_SCENE_CHUNK_OPTIONS: ResolvedSceneChunkOptions = {
    chunkReadCacheSize: 128,
    chunkPrefetchWindow: 0,
    ghostMode: "visible-first",
    targetMinFps: 20,
    loadProfile: "max-speed",
    deferIfcProperties: true,
    preferWorkerOctree: true,
    fastGeometrySanitize: true
};

export function resolveSceneChunkOptions(options?: SceneChunkOptions): ResolvedSceneChunkOptions {
    return {
        chunkReadCacheSize: Math.max(8, Math.min(256, Math.floor(options?.chunkReadCacheSize ?? DEFAULT_SCENE_CHUNK_OPTIONS.chunkReadCacheSize))),
        chunkPrefetchWindow: Math.max(0, Math.min(32, Math.floor(options?.chunkPrefetchWindow ?? DEFAULT_SCENE_CHUNK_OPTIONS.chunkPrefetchWindow))),
        ghostMode: options?.ghostMode ?? DEFAULT_SCENE_CHUNK_OPTIONS.ghostMode,
        targetMinFps: Math.max(20, Math.min(60, Math.floor(options?.targetMinFps ?? DEFAULT_SCENE_CHUNK_OPTIONS.targetMinFps))),
        loadProfile: options?.loadProfile ?? DEFAULT_SCENE_CHUNK_OPTIONS.loadProfile,
        deferIfcProperties: options?.deferIfcProperties ?? DEFAULT_SCENE_CHUNK_OPTIONS.deferIfcProperties,
        preferWorkerOctree: options?.preferWorkerOctree ?? DEFAULT_SCENE_CHUNK_OPTIONS.preferWorkerOctree,
        fastGeometrySanitize: options?.fastGeometrySanitize ?? DEFAULT_SCENE_CHUNK_OPTIONS.fastGeometrySanitize
    };
}
