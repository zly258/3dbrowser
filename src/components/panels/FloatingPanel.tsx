import React, { useRef, useEffect, useCallback } from "react";
import { IconClose } from "../../theme/Icons";

interface FloatingPanelProps {
    title: string;
    onClose?: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    resizable?: boolean;
    movable?: boolean;
    theme?: any;
    storageId?: string;
    modal?: boolean;
    autoHeight?: boolean;
    closeLabel?: string;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
    title,
    onClose,
    children,
    width = 300,
    height,
    x = 100,
    y = 100,
    resizable = false,
    movable = true,
    storageId,
    modal = false,
    autoHeight = height === undefined,
    closeLabel = "Close"
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const panelMinSizeByStorage: Record<string, { w: number; h: number }> = {
        tool_measure: { w: 320, h: 400 },
        tool_search: { w: 620, h: 500 },
        tool_export: { w: 400, h: 430 },
        tool_screenshot: { w: 380, h: 300 },
        tool_clip: { w: 410, h: 260 },
        tool_viewpoint: { w: 380, h: 460 },
        tool_explode: { w: 340, h: 360 },
        tool_clash: { w: 520, h: 460 }
    };
    const panelMinSize = storageId ? panelMinSizeByStorage[storageId] : undefined;
    // 面板默认/上限尺寸：超出时按上限收敛，避免“面板过大挡住视口”
    const panelMaxSizeByStorage: Record<string, { w: number; h: number }> = {
        tool_search: { w: 640, h: 520 },
        tool_clash: { w: 520, h: 500 },
        tool_viewpoint: { w: 380, h: 460 }
    };
    const panelMaxSize = storageId ? panelMaxSizeByStorage[storageId] : undefined;
    const minWidth = panelMinSize?.w ?? 220;
    const minHeight = panelMinSize?.h ?? 120;
    const getViewportSizeLimit = () => ({
        w: Math.max(220, window.innerWidth - 32),
        h: Math.max(160, window.innerHeight - 64)
    });
    const clampSize = (w: number, h: number) => {
        const limit = getViewportSizeLimit();
        const effectiveMinWidth = Math.min(minWidth, limit.w);
        const effectiveMinHeight = Math.min(minHeight, limit.h);
        const maxWidth = panelMaxSize ? Math.min(limit.w, Math.max(effectiveMinWidth, panelMaxSize.w)) : limit.w;
        const maxHeight = panelMaxSize ? Math.min(limit.h, Math.max(effectiveMinHeight, panelMaxSize.h)) : limit.h;
        return {
            w: Math.max(effectiveMinWidth, Math.min(w, maxWidth)),
            h: Math.max(effectiveMinHeight, Math.min(h, maxHeight))
        };
    };
    const getInitialPos = () => {
        if (modal) {
            return {
                x: Math.max(0, (window.innerWidth - width) / 2),
                y: Math.max(0, (window.innerHeight - (height ?? minHeight)) / 2)
            };
        }
        if (storageId) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.pos && typeof parsed.pos.x === 'number' && typeof parsed.pos.y === 'number') {
                        return {
                            x: Math.min(Math.max(0, parsed.pos.x), window.innerWidth - 50),
                            y: Math.min(Math.max(0, parsed.pos.y), window.innerHeight - 50)
                        };
                    }
                }
            } catch { }
        }
        if (x === 100 && y === 100 && !storageId) {
            return {
                x: Math.max(0, (window.innerWidth - width) / 2),
                y: Math.max(0, (window.innerHeight - (height ?? minHeight)) / 2)
            };
        }
        return { x, y };
    };

    const getInitialSize = () => {
        if (storageId && resizable) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.size && typeof parsed.size.w === 'number' && typeof parsed.size.h === 'number') {
                        return clampSize(parsed.size.w, parsed.size.h);
                    }
                }
            } catch { }
        }
        return clampSize(width, height ?? minHeight);
    };
    const posRef = useRef(getInitialPos());
    const sizeRef = useRef(getInitialSize());
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const resizeDirection = useRef<ResizeDirection | null>(null);
    const dragStart = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: 0, h: 0 });
    const applyStyle = useCallback(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const size = sizeRef.current;
        panel.style.width = `${size.w}px`;
        if (!autoHeight) {
            panel.style.height = `${size.h}px`;
        }
        // 模态面板由 CSS（left/top 50% + translate(-50%,-50%)）居中，不参与坐标计算
        if (modal) return;
        const pos = posRef.current;
        panel.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }, [autoHeight, modal]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging.current && !isResizing.current) return;
        e.preventDefault();

        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        const panel = panelRef.current;

        if (isDragging.current) {
            let limitW = window.innerWidth;
            let limitH = window.innerHeight;
            if (panel?.parentElement) {
                limitW = panel.parentElement.clientWidth;
                limitH = panel.parentElement.clientHeight;
            }

            const panelHeight = autoHeight ? (panel?.offsetHeight || sizeRef.current.h) : sizeRef.current.h;
            const maxX = limitW - sizeRef.current.w;
            const maxY = limitH - panelHeight;

            posRef.current = {
                x: Math.max(0, Math.min(startPos.current.x + dx, maxX)),
                y: Math.max(0, Math.min(startPos.current.y + dy, maxY))
            };
            applyStyle();
        } else if (isResizing.current && resizeDirection.current) {
            const dir = resizeDirection.current;
            let newW = startSize.current.w;
            let newH = startSize.current.h;
            let newX = startPos.current.x;
            let newY = startPos.current.y;

            if (dir.includes('e')) {
                newW = Math.max(minWidth, startSize.current.w + dx);
            }
            if (dir.includes('w')) {
                const maxDx = startSize.current.w - minWidth;
                const actualDx = Math.min(dx, maxDx);
                newW = startSize.current.w - actualDx;
                newX = startPos.current.x + actualDx;
            }
            if (dir.includes('s')) {
                newH = Math.max(minHeight, startSize.current.h + dy);
            }
            if (dir.includes('n')) {
                const maxDy = startSize.current.h - minHeight;
                const actualDy = Math.min(dy, maxDy);
                newH = startSize.current.h - actualDy;
                newY = startPos.current.y + actualDy;
            }

            sizeRef.current = { w: newW, h: newH };
            if (dir.includes('w') || dir.includes('n')) {
                posRef.current = { x: newX, y: newY };
            }
            applyStyle();
        }
    }, [minWidth, minHeight, autoHeight, applyStyle]);

    const handleMouseUp = useCallback(() => {
        if (isDragging.current || isResizing.current) {
            if (storageId) {
                try {
                    localStorage.setItem(`panel_${storageId}`, JSON.stringify({
                        pos: posRef.current,
                        size: sizeRef.current
                    }));
                } catch { }
            }
        }
        isDragging.current = false;
        isResizing.current = false;
        resizeDirection.current = null;
        document.body.style.cursor = '';
    }, [storageId]);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);
    // 模态面板由 CSS 居中（translate(-50%,-50%)），无需 JS 计算位置，
    // 这样内容高度变化（切换页签/展开详情）也不会发生位移跳动。

    // 非模态面板：保证面板完整落在视口容器内，避免窄窗口下被裁掉
    useEffect(() => {
        if (modal) return;

        const clampIntoContainer = () => {
            const panel = panelRef.current;
            if (!panel) return;
            const parent = panel.parentElement;
            const limitW = parent?.clientWidth ?? window.innerWidth;
            const limitH = parent?.clientHeight ?? window.innerHeight;
            const maxW = Math.max(220, limitW - 16);
            const maxH = Math.max(160, limitH - 16);

            // 先收尺寸，再收位置
            const nextW = Math.min(sizeRef.current.w, maxW);
            const nextH = Math.min(sizeRef.current.h, maxH);
            if (nextW !== sizeRef.current.w || nextH !== sizeRef.current.h) {
                sizeRef.current = { w: nextW, h: nextH };
            }

            const measuredHeight = autoHeight
                ? (panel.offsetHeight || sizeRef.current.h)
                : sizeRef.current.h;
            const maxX = Math.max(0, limitW - sizeRef.current.w);
            const maxY = Math.max(0, limitH - measuredHeight);
            const nextX = Math.max(0, Math.min(posRef.current.x, maxX));
            const nextY = Math.max(0, Math.min(posRef.current.y, maxY));

            if (nextX !== posRef.current.x || nextY !== posRef.current.y) {
                posRef.current = { x: nextX, y: nextY };
            }

            applyStyle();
        };

        clampIntoContainer();
        window.addEventListener('resize', clampIntoContainer);
        return () => window.removeEventListener('resize', clampIntoContainer);
    }, [autoHeight, modal, applyStyle]);

    const onHeaderDown = (e: React.MouseEvent) => {
        if (modal || e.button !== 0 || !movable) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startPos.current = { ...posRef.current };
        document.body.style.cursor = 'grabbing';
    };

    const onResizeDown = (direction: ResizeDirection) => (e: React.MouseEvent) => {
        if (modal || e.button !== 0 || !resizable) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        resizeDirection.current = direction;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...sizeRef.current };
        startPos.current = { ...posRef.current };
        const cursors: Record<ResizeDirection, string> = {
            'n': 'ns-resize', 's': 'ns-resize',
            'e': 'ew-resize', 'w': 'ew-resize',
            'ne': 'nesw-resize', 'sw': 'nesw-resize',
            'nw': 'nwse-resize', 'se': 'nwse-resize'
        };
        document.body.style.cursor = cursors[direction];
    };

    const onCloseClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClose?.();
    };

    // 模态：ESC 关闭
    useEffect(() => {
        if (!modal || !onClose) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [modal, onClose]);

    const pos = posRef.current;
    const size = sizeRef.current;
    const viewportLimitedHeight = typeof window !== "undefined"
        ? Math.max(minHeight, Math.min(size.h, window.innerHeight - 64))
        : size.h;

    return (
        <>
            {modal && (
                <div
                    className="ui-modal-scrim"
                    onClick={() => onClose?.()}
                />
            )}
            <div
                ref={panelRef}
                className={`ui-panel${modal ? ' ui-panel-modal' : ''}${storageId ? ` ui-panel-${storageId}` : ''}`}
                style={modal ? {
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: size.w,
                    height: autoHeight ? 'auto' : viewportLimitedHeight,
                } : {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    width: size.w,
                    height: autoHeight ? 'auto' : viewportLimitedHeight,
                    willChange: isDragging.current || isResizing.current ? 'transform, width, height' : 'auto',
                }}
            >
                <div
                    className={`ui-panel-header ${(!movable || modal) ? 'ui-panel-header-static' : ''}`}
                    onMouseDown={onHeaderDown}
                >
                    <span className="ui-panel-title" title={title}>{title}</span>
                    {onClose && (
                        <button
                            className="ui-panel-close"
                            onClick={onCloseClick}
                            title={closeLabel}
                            aria-label={closeLabel}
                        >
                            <IconClose width={13} height={13} />
                        </button>
                    )}
                </div>
                <div className="ui-panel-content">
                    {children}
                </div>
                {resizable && !modal && (
                    <>
                        <div className="ui-panel-resize-handle ui-panel-resize-e" onMouseDown={onResizeDown('e')} />
                        <div className="ui-panel-resize-handle ui-panel-resize-s" onMouseDown={onResizeDown('s')} />
                        <div className="ui-panel-resize-handle ui-panel-resize-w" onMouseDown={onResizeDown('w')} />
                        <div className="ui-panel-resize-handle ui-panel-resize-se" onMouseDown={onResizeDown('se')} />
                        <div className="ui-panel-resize-handle ui-panel-resize-sw" onMouseDown={onResizeDown('sw')} />
                    </>
                )}
            </div>
        </>
    );
};
