import { useCallback, useEffect, useRef } from "react";
import { usePersistentState } from "./usePersistentState";

interface UseViewerLayoutOptions {
    propShowOutline?: boolean;
    propShowProperties?: boolean;
    setShowOutline: (value: boolean) => void;
    setShowProps: (value: boolean) => void;
}

/* 三栏尺寸（对齐 MD3 参考抽屉宽）：左约 224px（200–264），右约 288px（240–340） */
const LEFT_MIN = 200;
const LEFT_MAX = 264;
const LEFT_DEFAULT = 224;
const RIGHT_MIN = 240;
const RIGHT_MAX = 340;
const RIGHT_DEFAULT = 288;

function clampWidth(value: number, min: number, max: number) {
    return Math.round(Math.max(min, Math.min(max, value)));
}

export function useViewerLayout(options: UseViewerLayoutOptions) {
    const {
        propShowOutline,
        propShowProperties,
        setShowOutline,
        setShowProps
    } = options;

    // 宽度持久化：ID 用面板级 key，避免与其它布局状态冲突
    const [leftWidth, setLeftWidth] = usePersistentState<number>(
        "viewer_sidebar_left_w",
        LEFT_DEFAULT,
        {
            parser: (raw) => {
                const parsed = Number(JSON.parse(raw));
                return Number.isFinite(parsed) ? clampWidth(parsed, LEFT_MIN, LEFT_MAX) : LEFT_DEFAULT;
            }
        }
    );
    const [rightWidth, setRightWidth] = usePersistentState<number>(
        "viewer_sidebar_right_w",
        RIGHT_DEFAULT,
        {
            parser: (raw) => {
                const parsed = Number(JSON.parse(raw));
                return Number.isFinite(parsed) ? clampWidth(parsed, RIGHT_MIN, RIGHT_MAX) : RIGHT_DEFAULT;
            }
        }
    );
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
                pendingLeftWidth.current = clampWidth(event.clientX, LEFT_MIN, LEFT_MAX);
            }
            if (resizingRight.current) {
                const nextWidth = window.innerWidth - event.clientX;
                pendingRightWidth.current = clampWidth(nextWidth, RIGHT_MIN, RIGHT_MAX);
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

    // 窗口变小时重新钳制，避免“右侧栏 428px 把视口压到 350px”这类问题。
    // 注意：窄窗口（移动端抽屉/悬浮卡接管布局）不参与钳制，
    // 否则一次手机访问就会把持久化的桌面宽度永久压到最小值。
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 768) return;
            const maxLeft = Math.min(LEFT_MAX, Math.max(LEFT_MIN, Math.floor(width * 0.28)));
            const maxRight = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, Math.floor(width * 0.32)));
            setLeftWidth((value) => clampWidth(value, LEFT_MIN, maxLeft));
            setRightWidth((value) => clampWidth(value, Math.min(RIGHT_MIN, Math.max(220, Math.floor(width * 0.24))), maxRight));
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [setLeftWidth, setRightWidth]);

    const nudgeLeft = useCallback((delta: number) => {
        setLeftWidth((value) => clampWidth(value + delta, LEFT_MIN, LEFT_MAX));
    }, [setLeftWidth]);

    const nudgeRight = useCallback((delta: number) => {
        setRightWidth((value) => clampWidth(value - delta, RIGHT_MIN, RIGHT_MAX));
    }, [setRightWidth]);

    return {
        leftWidth,
        rightWidth,
        resizingLeft,
        resizingRight,
        nudgeLeft,
        nudgeRight
    };
}
