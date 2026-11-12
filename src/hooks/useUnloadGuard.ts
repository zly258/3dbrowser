import { useCallback, useEffect, useRef, useState } from "react";

interface UseUnloadGuardOptions {
    /** 是否有正在进行的长耗时操作（载入 / 打开 / 导出…） */
    busy: boolean;
    /** 返回「正在做什么」的描述；返回空字符串表示不拦截 */
    getMessage: () => string;
    /** 用户确认刷新后的动作，默认 location.reload() */
    onReload?: () => void;
}

interface UnloadGuardResult {
    /** 自定义确认框是否打开 */
    promptOpen: boolean;
    /** 触发时抓到的描述文案 */
    message: string;
    /** 用户确认「仍然刷新」 */
    confirmReload: () => void;
    /** 用户选择继续等待 */
    cancel: () => void;
}

/**
 * 工作状态下刷新页面的守卫。
 *
 * 分两层：
 * 1. beforeunload —— 浏览器刷新按钮、菜单刷新、关标签页都走这里，是唯一能真正拦住
 *    浏览器级刷新的手段。现代浏览器只显示自己的通用文案（自定义文案会被忽略），
 *    所以它只负责「挡一下」。
 * 2. 键盘拦截 —— F5 / Ctrl+R / Ctrl+Shift+R 可以拦下来，先弹应用自己的确认框，
 *    把「正在做什么、刷新会中断」说清楚，用户确认后才真正 reload。
 *
 * 操作结束后（busy=false）两层都会自动解除。
 */
export function useUnloadGuard({ busy, getMessage, onReload }: UseUnloadGuardOptions): UnloadGuardResult {
    const [promptOpen, setPromptOpen] = useState(false);
    const [message, setMessage] = useState("");

    const allowLeaveRef = useRef(false);
    const getMessageRef = useRef(getMessage);

    useEffect(() => {
        if (!busy) {
            // 操作结束：解除拦截，若确认框还开着也一并收起
            allowLeaveRef.current = false;
            setPromptOpen(false);
        }
    }, [busy]);

    useEffect(() => {
        getMessageRef.current = getMessage;
    });

    useEffect(() => {
        if (!busy) return;

        const handler = (event: BeforeUnloadEvent) => {
            if (allowLeaveRef.current) return;
            if (!getMessageRef.current()) return;

            // 只有 returnValue 非空 / preventDefault 才会触发浏览器的离开确认
            event.preventDefault();
            event.returnValue = "unsaved";
        };

        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [busy]);

    useEffect(() => {
        if (!busy) return;

        const handler = (event: KeyboardEvent) => {
            if (allowLeaveRef.current) return;

            const isF5 = event.key === "F5";
            const isReloadCombo =
                (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";

            if (!isF5 && !isReloadCombo) return;

            const text = getMessageRef.current();
            if (!text) return;

            event.preventDefault();
            event.stopPropagation();

            setMessage(text);
            setPromptOpen(true);
        };

        // capture 阶段拦住，避免其它快捷键处理器先吃掉事件
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [busy]);

    const confirmReload = useCallback(() => {
        allowLeaveRef.current = true;
        setPromptOpen(false);

        if (onReload) {
            onReload();
            return;
        }

        window.location.reload();
    }, [onReload]);

    const cancel = useCallback(() => {
        setPromptOpen(false);
    }, []);

    return { promptOpen, message, confirmReload, cancel };
}