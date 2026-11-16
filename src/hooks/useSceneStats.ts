import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { SceneManagerStats } from "../utils/scene-manager/types";

interface UseSceneStatsOptions {
    mgrInstance: SceneManager | null;
    showStats: boolean;
    setStats: Dispatch<SetStateAction<SceneManagerStats>>;
}

export function useSceneStats({ mgrInstance, showStats, setStats }: UseSceneStatsOptions) {
    useEffect(() => {
        if (!mgrInstance || !showStats) return;

        const updateStats = () => {
            if (document.visibilityState !== "visible") return;
            // 相机运动时跳过：getStats 会遍历整个 contentGroup 估算贴图显存，
            // 每帧/每秒执行会与渲染抢主线程，表现为旋转时周期性卡顿。
            if (mgrInstance.isCameraMovingNow?.()) return;
            setStats(mgrInstance.getStats());
        };

        updateStats();
        const statsInterval = window.setInterval(updateStats, 1000);
        document.addEventListener("visibilitychange", updateStats);

        return () => {
            window.clearInterval(statsInterval);
            document.removeEventListener("visibilitychange", updateStats);
        };
    }, [mgrInstance, setStats, showStats]);
}

