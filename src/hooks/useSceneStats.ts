import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SceneManager } from "../utils/SceneManager";
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

