import { useCallback, useEffect, useRef, useState } from "react";

interface UseViewerLayoutOptions {
    propShowOutline?: boolean;
    propShowProperties?: boolean;
    setShowOutline: (value: boolean) => void;
    setShowProps: (value: boolean) => void;
}

export function useViewerLayout(options: UseViewerLayoutOptions) {
    const {
        propShowOutline,
        propShowProperties,
        setShowOutline,
        setShowProps
    } = options;

    const [leftWidth, setLeftWidth] = useState(260);
    const [rightWidth, setRightWidth] = useState(300);
    const resizingLeft = useRef(false);
    const resizingRight = useRef(false);

    // 拖拽期间的待提交尺寸：每个动画帧最多提交一次 React 更新，
    // 避免高频 mousemove 引发整棵组件树重渲染（场景闪烁/卡顿的另一半原因）。
    const pendingLeftWidth = useRef<number | null>(null);
    const pendingRightWidth = useRef<number | null>(null);
    const rafId = useRef<number | null>(null);

    const flushPendingWidths = useCallback(() => {
        rafId.current = null;
        if (pendingLeftWidth.current !== null) {
            setLeftWidth(pendingLeftWidth.current);
            pendingLeftWidth.current = null;
        }
        if (pendingRightWidth.current !== null) {
            setRightWidth(pendingRightWidth.current);
            pendingRightWidth.current = null;
        }
    }, []);

    useEffect(() => {
        if (propShowOutline !== undefined) {
            setShowOutline(propShowOutline);
        }
    }, [propShowOutline, setShowOutline]);

    useEffect(() => {
        if (propShowProperties !== undefined) {
            setShowProps(propShowProperties);
        }
    }, [propShowProperties, setShowProps]);

    useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            if (!resizingLeft.current && !resizingRight.current) return;

            // 拖拽时阻止文本选中，避免选中态导致额外的重排与重绘
            event.preventDefault();

            if (resizingLeft.current) {
                pendingLeftWidth.current = Math.max(150, Math.min(500, event.clientX));
            }
            if (resizingRight.current) {
                const nextWidth = window.innerWidth - event.clientX;
                pendingRightWidth.current = Math.max(200, Math.min(600, nextWidth));
            }

            if (rafId.current === null) {
                rafId.current = requestAnimationFrame(flushPendingWidths);
            }
        };

        const handleUp = () => {
            resizingLeft.current = false;
            resizingRight.current = false;
            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
            // 立即提交最后一次尺寸，避免松手后残留一帧旧宽度
            flushPendingWidths();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
        };
    }, [flushPendingWidths]);

    return {
        leftWidth,
        rightWidth,
        resizingLeft,
        resizingRight
    };
}
