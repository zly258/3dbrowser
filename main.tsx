import React from "react";
import { createRoot } from "react-dom/client";
import { ThreeViewer } from "./src/ThreeViewer";
import "./src/styles/index.css";

declare global {
    interface Window {
        __3DBOOT__?: {
            markMounted: () => void;
            fail: (message: string) => void;
        };
    }
}

/** 启动失败时把错误交给 index.html 的兜底壳，避免留下浅灰空白页 */
function reportBootFailure(error: unknown) {
    const message = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    // eslint-disable-next-line no-console
    console.error("[3dbrowser] bootstrap failed", error);
    if (typeof window !== "undefined" && window.__3DBOOT__) {
        window.__3DBOOT__.fail(message);
    }
}

/**
 * React 19 的 render 是异步提交的：挂载完成后通知兜底脚本收起启动壳。
 * 用 rAF 轮询而不是一次性判断，避免首帧还没提交就误判失败。
 */
function watchForMount(timeoutMs = 20000) {
    const startedAt = Date.now();
    const tick = () => {
        const mounted = !!document.querySelector(".ui-app-shell");
        if (mounted) {
            window.__3DBOOT__?.markMounted();
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            reportBootFailure(new Error("App shell did not mount within 20s"));
            return;
        }
        window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
}

const container = document.getElementById("root");

if (container) {
    try {
        const root = createRoot(container);
        root.render(<ThreeViewer />);
        watchForMount();
    } catch (error) {
        reportBootFailure(error);
    }
} else {
    reportBootFailure(new Error("Mount point #root is missing"));
}
