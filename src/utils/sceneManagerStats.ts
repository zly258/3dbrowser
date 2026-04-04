import type * as THREE from "three";
import { estimateTextureMemoryMb } from "./scene/stats";
import type { SceneManagerStats } from "./sceneManagerTypes";

interface SceneManagerStatsContext {
    renderer: THREE.WebGLRenderer;
    contentGroup: THREE.Group;
    originalStats: {
        meshes: number;
        faces: number;
        memory: number;
    };
    chunkLoadedCount: number;
    chunksLength: number;
    processingChunkCount: number;
    activePixelRatio: number;
}

export function collectSceneManagerStats(context: SceneManagerStatsContext): SceneManagerStats {
    const drawCalls = context.renderer.info.render.calls;
    const textureMemory = estimateTextureMemoryMb(context.contentGroup);

    return {
        meshes: context.originalStats.meshes,
        faces: context.originalStats.faces,
        memory: parseFloat(context.originalStats.memory.toFixed(2)),
        textureMemory,
        drawCalls,
        chunksLoaded: context.chunkLoadedCount,
        chunksTotal: context.chunksLength,
        chunksQueued: context.processingChunkCount,
        pixelRatio: Number(context.activePixelRatio.toFixed(2))
    };
}
