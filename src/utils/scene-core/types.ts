export type GhostMode = "visible-first" | "all";
export type PerformancePreset = "balanced" | "smooth" | "quality";
export type LoadProfile = "max-speed" | "balanced";

export interface SceneChunkOptions {
    chunkReadCacheSize?: number;
    /** 分块原始二进制读取缓存的总字节上限（MB），默认 128。 */
    chunkReadCacheMB?: number;
    /** 远景粗 LOD：按实例世界尺寸剔除小构件（默认关闭，低内存机器可开启）。 */
    coarseLod?: boolean;
    /** 渲染预算：auto=大模型只绘制预算内的分块，其余用线框代理；full=全部绘制（旧行为） */
    renderBudget?: "auto" | "full";
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
    chunkReadCacheMB: number;
    coarseLod: boolean;
    renderBudget: "auto" | "full";
    /** 默认 full：远景显示真实几何；auto 才使用线框代理 */
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
    chunkReadCacheMB: 128,
    coarseLod: false,
    renderBudget: "full",
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
        chunkReadCacheMB: Math.max(16, Math.min(1024, Math.floor(options?.chunkReadCacheMB ?? DEFAULT_SCENE_CHUNK_OPTIONS.chunkReadCacheMB))),
        coarseLod: options?.coarseLod ?? DEFAULT_SCENE_CHUNK_OPTIONS.coarseLod,
        renderBudget: options?.renderBudget ?? DEFAULT_SCENE_CHUNK_OPTIONS.renderBudget,
        chunkPrefetchWindow: Math.max(0, Math.min(32, Math.floor(options?.chunkPrefetchWindow ?? DEFAULT_SCENE_CHUNK_OPTIONS.chunkPrefetchWindow))),
        ghostMode: options?.ghostMode ?? DEFAULT_SCENE_CHUNK_OPTIONS.ghostMode,
        targetMinFps: Math.max(20, Math.min(60, Math.floor(options?.targetMinFps ?? DEFAULT_SCENE_CHUNK_OPTIONS.targetMinFps))),
        loadProfile: options?.loadProfile ?? DEFAULT_SCENE_CHUNK_OPTIONS.loadProfile,
        deferIfcProperties: options?.deferIfcProperties ?? DEFAULT_SCENE_CHUNK_OPTIONS.deferIfcProperties,
        preferWorkerOctree: options?.preferWorkerOctree ?? DEFAULT_SCENE_CHUNK_OPTIONS.preferWorkerOctree,
        fastGeometrySanitize: options?.fastGeometrySanitize ?? DEFAULT_SCENE_CHUNK_OPTIONS.fastGeometrySanitize
    };
}
