import { useEffect, useState } from "react";

/**
 * 三端视口模式：
 *  - desktop    PC 桌面端（>= 1024px）
 *  - portrait   移动竖屏（< 768px）
 *  - landscape  移动横屏（< 900px 且视口高度 < 500px）
 *
 * 判定顺序：先看横屏（宽 < 900 且高 < 500），再看竖屏（宽 < 768），
 * 其余按桌面处理。所有断点与规范三端表格一致。
 */
export type ViewportMode = "desktop" | "portrait" | "landscape";

const LANDSCAPE_MAX_W = 900;
const LANDSCAPE_MAX_H = 500;
const PORTRAIT_MAX_W = 768;

export function resolveViewportMode(width: number, height: number): ViewportMode {
    if (width < LANDSCAPE_MAX_W && height < LANDSCAPE_MAX_H) return "landscape";
    if (width < PORTRAIT_MAX_W) return "portrait";
    return "desktop";
}

function readViewport(): { width: number; height: number } {
    if (typeof window === "undefined") return { width: 1280, height: 800 };
    return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewportMode(): ViewportMode {
    const [mode, setMode] = useState<ViewportMode>(() => {
        const { width, height } = readViewport();
        return resolveViewportMode(width, height);
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        let frame = 0;
        const apply = () => {
            frame = 0;
            const { width, height } = readViewport();
            setMode((prev) => {
                const next = resolveViewportMode(width, height);
                return next === prev ? prev : next;
            });
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(apply);
        };

        apply();
        window.addEventListener("resize", schedule);
        window.addEventListener("orientationchange", schedule);
        return () => {
            window.removeEventListener("resize", schedule);
            window.removeEventListener("orientationchange", schedule);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    return mode;
}
