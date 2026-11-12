import type { ChunkRenderPhase, ChunkRuntimeProfileLike } from "./chunkScheduling";

export function selectChunksToUnload(options: {
    isCameraMoving: boolean;
    loadedChunks: any[];
    maxLoadedChunks: number;
    maxResidentMB?: number;
    chunkCostMB?: (chunk: any) => number;
    cameraPos: { distanceToSquared(target: any): number };
    now: number;
    chunkResidencyMs: number;
}) {
    const {
        isCameraMoving,
        loadedChunks,
        maxLoadedChunks,
        maxResidentMB,
        chunkCostMB,
        cameraPos,
        now,
        chunkResidencyMs
    } = options;

    const cost = chunkCostMB || (() => 0);
    const hasMemoryBudget = typeof maxResidentMB === "number" && maxResidentMB > 0;
    const usedMB = hasMemoryBudget
        ? loadedChunks.reduce((sum, chunk) => sum + cost(chunk), 0)
        : 0;
    const countExcess = Math.max(0, loadedChunks.length - maxLoadedChunks);
    const overMemory = hasMemoryBudget && usedMB > maxResidentMB;
    if (countExcess === 0 && !overMemory) {
        return [];
    }

    // 由远到近排序：优先卸载最远分块。摄像机静止时允许卸载“仍然可见”的远处分块，
    // 否则整模型都在视野内时会无限加载直到堆溢出（超大批量导出模型的典型崩溃原因）。
    const sortedChunks = [...loadedChunks].sort(
        (a, b) => b.center.distanceToSquared(cameraPos) - a.center.distanceToSquared(cameraPos)
    );

    const unloadTargets: any[] = [];
    const picked = new Set<any>();
    let remainingMB = usedMB;

    const needsMore = () => unloadTargets.length < countExcess || (hasMemoryBudget && remainingMB > maxResidentMB);
    const pick = (chunk: any) => {
        if (picked.has(chunk)) return;
        picked.add(chunk);
        unloadTargets.push(chunk);
        remainingMB -= cost(chunk);
    };

    // 第一轮：卸载不可见或已过驻留时间的分块。
    for (const chunk of sortedChunks) {
        if (!needsMore()) break;
        const lastTouchedAt = Math.max(chunk.lastVisibleAt || 0, chunk.lastFocusAt || 0);
        const isInvisible = !chunk.mesh || !chunk.mesh.visible;
        const isStale = (now - lastTouchedAt) >= chunkResidencyMs;
        if (isInvisible || isStale) {
            pick(chunk);
        }
    }

    // 第二轮：仍在超限时，即使分块当前可见，也从最远处开始卸载（下次进入视野会重新加载）。
    // 内存超预算时即使正在移动也要卸载，否则大模型旋转视角时仍可能撑爆堆。
    if (!isCameraMoving || overMemory) {
        for (const chunk of sortedChunks) {
            if (!needsMore()) break;
            if (!chunk.mesh) continue;
            pick(chunk);
        }
    }

    return unloadTargets;
}

export function planChunkLoads<TProfile extends ChunkRuntimeProfileLike>(options: {
    toLoad: any[];
    now: number;
    chunkLoadResumeAt: number;
    maxConcurrentChunkLoads: number;
    processingChunkCount: number;
    maxResidentChunks?: number;
    residentChunkCount?: number;
    maxResidentMB?: number;
    residentUsedMB?: number;
    chunkCostMB?: (chunk: any) => number;
    chunkWarmupActive: boolean;
    chunkLoadedCount: number;
    initialChunkLoadTarget: number;
    warmupChunkBoost: number;
    getChunkFrameBudget: (phase: ChunkRenderPhase, profile: TProfile, warmupExtra: number) => number;
    phase: ChunkRenderPhase;
    profile: TProfile;
}) {
    const {
        toLoad,
        now,
        chunkLoadResumeAt,
        maxConcurrentChunkLoads,
        processingChunkCount,
        maxResidentChunks,
        residentChunkCount = 0,
        maxResidentMB,
        residentUsedMB = 0,
        chunkCostMB,
        chunkWarmupActive,
        chunkLoadedCount,
        initialChunkLoadTarget,
        warmupChunkBoost,
        getChunkFrameBudget,
        phase,
        profile
    } = options;

    if (toLoad.length === 0 || now < chunkLoadResumeAt) {
        return [];
    }

    const sortedChunks = [...toLoad].sort((a, b) => b.priority - a.priority);
    const available = maxConcurrentChunkLoads - processingChunkCount;
    if (available <= 0) {
        return [];
    }

    const warmupExtra = chunkWarmupActive && chunkLoadedCount < initialChunkLoadTarget
        ? warmupChunkBoost
        : 0;
    const frameBudget = getChunkFrameBudget(phase, profile, warmupExtra);
    const residentAvailable = typeof maxResidentChunks === "number"
        ? Math.max(0, maxResidentChunks - residentChunkCount - processingChunkCount)
        : Number.POSITIVE_INFINITY;
    const maxSelectable = Math.min(available, frameBudget, sortedChunks.length, residentAvailable);

    // 再按“解码后内存预算”挑选：大分块不能无限制并发加载，否则单个 70MB 分块解压后
    // 放大到数百 MB，几十个就会击穿 JS 堆上限。
    const hasMemoryBudget = typeof maxResidentMB === "number" && maxResidentMB > 0;
    let budgetLeftMB = hasMemoryBudget ? Math.max(0, maxResidentMB! - residentUsedMB) : Number.POSITIVE_INFINITY;
    const cost = chunkCostMB || (() => 0);
    const selected: any[] = [];

    for (const chunk of sortedChunks) {
        if (selected.length >= maxSelectable) break;
        const chunkMB = cost(chunk);
        // 至少允许加载第一个分块，避免预算极小时完全卡住；后续跳过会超预算的大分块。
        if (hasMemoryBudget && selected.length > 0 && chunkMB > budgetLeftMB) continue;
        selected.push(chunk);
        budgetLeftMB -= chunkMB;
    }

    return selected;
}
