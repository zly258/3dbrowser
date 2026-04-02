import { PerformancePreset } from "./types";

export interface AdaptiveRuntimeInput {
    hardwareConcurrency: number;
    frameDeltaMs: number;
    targetMinFps: number;
    currentConcurrentLoads: number;
    currentFrameBudget: number;
}

export interface AdaptiveRuntimeOutput {
    nextConcurrentLoads: number;
    nextFrameBudget: number;
}

export function deriveInitialRuntimeFromHardware(
    cpuCount: number,
    preset: PerformancePreset
) {
    const normalizedCpu = Math.max(2, cpuCount);
    const presetFactor = preset === "smooth" ? 0.85 : preset === "quality" ? 1.15 : 1;
    const maxConcurrentChunkLoads = Math.max(20, Math.min(128, Math.floor(normalizedCpu * 10 * presetFactor)));
    const maxChunkLoadsPerFrame = Math.max(8, Math.min(48, Math.floor(normalizedCpu * 3 * presetFactor)));
    return {
        maxConcurrentChunkLoads,
        maxChunkLoadsPerFrame
    };
}

export function adaptChunkRuntime(input: AdaptiveRuntimeInput): AdaptiveRuntimeOutput {
    const targetFrameMs = 1000 / Math.max(20, input.targetMinFps);
    const overloaded = input.frameDeltaMs > targetFrameMs * 1.08;
    const underLoaded = input.frameDeltaMs < targetFrameMs * 0.78;

    let nextConcurrentLoads = input.currentConcurrentLoads;
    let nextFrameBudget = input.currentFrameBudget;

    if (overloaded) {
        nextConcurrentLoads = Math.max(8, input.currentConcurrentLoads - 2);
        nextFrameBudget = Math.max(4, input.currentFrameBudget - 1);
    } else if (underLoaded) {
        nextConcurrentLoads = Math.min(128, input.currentConcurrentLoads + 1);
        nextFrameBudget = Math.min(64, input.currentFrameBudget + 1);
    }

    return { nextConcurrentLoads, nextFrameBudget };
}

