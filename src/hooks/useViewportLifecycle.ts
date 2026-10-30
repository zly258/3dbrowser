import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { ViewerErrorState, ViewerToast } from "../viewer/types";

interface UseViewportLifecycleOptions {
    allowDragOpen: boolean;
    mgrInstance: SceneManager | null;
    viewportRef: RefObject<HTMLDivElement | null>;
    t: (key: string) => string;
    processFiles: (items: (string | File)[]) => Promise<void>;
    setToast: Dispatch<SetStateAction<ViewerToast | null>>;
    setErrorState: Dispatch<SetStateAction<ViewerErrorState>>;
}

const SUPPORTED_DRAG_EXTENSIONS = [".lmb", ".glb", ".gltf", ".ifc", ".nbim", ".fbx", ".obj", ".stl", ".ply", ".3ds", ".dae", ".stp", ".step", ".igs", ".iges"];

const IGNORED_GLOBAL_ERRORS = [
    "ResizeObserver loop completed",
    "ResizeObserver loop limit",
    "texImage3D: FLIP_Y or PREMULTIPLY_ALPHA"
];

export function useViewportLifecycle({
    allowDragOpen,
    mgrInstance,
    viewportRef,
    t,
    processFiles,
    setToast,
    setErrorState
}: UseViewportLifecycleOptions) {
    useEffect(() => {
        if (!viewportRef.current || !mgrInstance) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            if (width === 0 || height === 0) return;

            // ResizeObserver 回调本身就运行在布局之后、绘制之前，
            // 直接在这里同步调整绘图缓冲，避免多包一层 rAF 导致缓冲区晚一帧更新，
            // 浏览器先呈现空白/拉伸的画布（闪烁）。
            mgrInstance.resize(width, height);
        });

        observer.observe(viewportRef.current);

        const handleWindowResize = () => {
            if (!viewportRef.current) return;
            const rect = viewportRef.current.getBoundingClientRect();
            mgrInstance.resize(rect.width, rect.height);
        };

        window.addEventListener("resize", handleWindowResize);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", handleWindowResize);
        };
    }, [mgrInstance, viewportRef]);

    useEffect(() => {
        const handleDragOver = (event: DragEvent) => {
            if (!allowDragOpen) return;
            event.preventDefault();
            event.stopPropagation();
        };

        const handleDrop = async (event: DragEvent) => {
            if (!allowDragOpen) return;
            event.preventDefault();
            event.stopPropagation();

            const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
            if (files.length === 0) return;

            const unsupportedFiles = files.filter((file) => {
                const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
                return !SUPPORTED_DRAG_EXTENSIONS.includes(ext);
            });

            if (unsupportedFiles.length > 0) {
                setToast({
                    message: `${t("failed")}: 不支持的格式 - ${unsupportedFiles.map((file) => file.name).join(", ")}`,
                    type: "error"
                });
            }

            const supportedFiles = files.filter((file) => {
                const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
                return SUPPORTED_DRAG_EXTENSIONS.includes(ext);
            });

            if (supportedFiles.length > 0) {
                await processFiles(supportedFiles);
            }
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, [allowDragOpen, processFiles, setToast, t]);

    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            const message = event.message || "";
            if ((!message && !event.error) || IGNORED_GLOBAL_ERRORS.some((item) => message.includes(item))) {
                return;
            }

            console.error("Global Error:", event.error || message);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: message || "An unexpected error occurred",
                detail: event.error?.stack || ""
            });
        };

        const handleRejection = (event: PromiseRejectionEvent) => {
            if (!event.reason) return;
            const message = event.reason?.message || String(event.reason);
            if (IGNORED_GLOBAL_ERRORS.some((item) => message.includes(item))) {
                return;
            }

            console.error("Unhandled Rejection:", event.reason);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: message || "A promise was rejected without reason",
                detail: event.reason?.stack || ""
            });
        };

        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);

        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, [setErrorState, t]);
}
