import React, { useState, useRef, useEffect, useCallback } from "react";
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
    modal?: boolean;  // 模态对话框模式
    autoHeight?: boolean;
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
    modal = false,  // 默认非模态模式
    autoHeight = height === undefined
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const minWidth = storageId === 'tool_measure' ? 320 : 220;
    const minHeight = storageId === 'tool_measure' ? 400 : 120;

    const [pos, setPos] = useState(() => {
        // 模态模式默认居中 - 模态模式会通过useEffect重新计算
        if (modal) {
            // 初始值，会被useEffect覆盖
            return {
                x: Math.max(0, (window.innerWidth - width) / 2),
                y: Math.max(0, (window.innerHeight - (height ?? minHeight)) / 2)
            };
        }

        // 如果有 storageId，尝试从 localStorage 加载
        if (storageId) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.pos && typeof parsed.pos.x === 'number' && typeof parsed.pos.y === 'number') {
                        const loadedX = Math.min(Math.max(0, parsed.pos.x), window.innerWidth - 50);
                        const loadedY = Math.min(Math.max(0, parsed.pos.y), window.innerHeight - 50);
                        return { x: loadedX, y: loadedY };
                    }
                }
            } catch (e) { console.error("Failed to load panel state", e); }
        }

        // 如果没有指定位置且没有 storageId，默认居中
        if (x === 100 && y === 100 && !storageId) {
            const centerX = (window.innerWidth - width) / 2;
            const centerY = (window.innerHeight - (height ?? minHeight)) / 2;
            return { x: Math.max(0, centerX), y: Math.max(0, centerY) };
        }
        return { x, y };
    });

    const [size, setSize] = useState(() => {
        if (storageId && resizable) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.size && typeof parsed.size.w === 'number' && typeof parsed.size.h === 'number') {
                        return {
                            w: Math.max(minWidth, parsed.size.w),
                            h: Math.max(minHeight, parsed.size.h)
                        };
                    }
                }
            } catch(e) {}
        }
        return { w: width, h: height ?? minHeight };
    });

    // 模态模式下窗口resize时重新居中
    useEffect(() => {
        if (!modal) return;

        const centerPanel = () => {
            const measuredHeight = autoHeight
                ? Math.min(window.innerHeight - 64, panelRef.current?.offsetHeight || size.h)
                : size.h;
            const centerX = (window.innerWidth - size.w) / 2;
            const centerY = (window.innerHeight - measuredHeight) / 2;
            setPos({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
        };

        window.addEventListener('resize', centerPanel);
        centerPanel(); // 立即执行一次以确保居中

        return () => {
            window.removeEventListener('resize', centerPanel);
        };
    }, [autoHeight, modal, size.w, size.h]);

    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const resizeDirection = useRef<ResizeDirection | null>(null);
    const dragStart = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: 0, h: 0 });
    const currentPosRef = useRef(pos);
    const currentSizeRef = useRef(size);
    const animationFrame = useRef<number>(0);

    useEffect(() => { currentPosRef.current = pos; }, [pos]);
    useEffect(() => { currentSizeRef.current = size; }, [size]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging.current && !isResizing.current) return;

        e.preventDefault();

        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);

        animationFrame.current = requestAnimationFrame(() => {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;

            if (isDragging.current) {
                let newX = startPos.current.x + dx;
                let newY = startPos.current.y + dy;

                let limitW = window.innerWidth;
                let limitH = window.innerHeight;

                if (panelRef.current?.parentElement) {
                    limitW = panelRef.current.parentElement.clientWidth;
                    limitH = panelRef.current.parentElement.clientHeight;
                }

                const maxX = limitW - size.w;
                const maxY = limitH - size.h;

                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                setPos({ x: newX, y: newY });
            } else if (isResizing.current && resizeDirection.current) {
                const dir = resizeDirection.current;
                let newW = startSize.current.w;
                let newH = startSize.current.h;
                let newX = startPos.current.x;
                let newY = startPos.current.y;

                // 水平方向
                if (dir.includes('e')) {
                    newW = Math.max(minWidth, startSize.current.w + dx);
                }
                if (dir.includes('w')) {
                    const maxDx = startSize.current.w - minWidth;
                    const actualDx = Math.min(dx, maxDx);
                    newW = startSize.current.w - actualDx;
                    newX = startPos.current.x + actualDx;
                }

                // 垂直方向
                if (dir.includes('s')) {
                    newH = Math.max(minHeight, startSize.current.h + dy);
                }
                if (dir.includes('n')) {
                    const maxDy = startSize.current.h - minHeight;
                    const actualDy = Math.min(dy, maxDy);
                    newH = startSize.current.h - actualDy;
                    newY = startPos.current.y + actualDy;
                }

                setSize({ w: newW, h: newH });
                if (dir.includes('w') || dir.includes('n')) {
                    setPos({ x: newX, y: newY });
                }
            }
        });
    }, [size, minWidth, minHeight]);

    const handleMouseUp = useCallback(() => {
        if ((isDragging.current || isResizing.current) && storageId) {
            try {
                const stateToSave = {
                    pos: currentPosRef.current,
                    size: currentSizeRef.current
                };
                localStorage.setItem(`panel_${storageId}`, JSON.stringify(stateToSave));
            } catch(e) { console.error("Failed to save panel state", e); }
        }

        isDragging.current = false;
        isResizing.current = false;
        resizeDirection.current = null;
        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    }, [storageId]);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };
    }, [handleMouseMove, handleMouseUp]);

    const onHeaderDown = (e: React.MouseEvent) => {
        // 模态模式下不可拖拽
        if (modal || e.button !== 0 || !movable) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startPos.current = { ...pos };
    };

    const onResizeDown = (direction: ResizeDirection) => (e: React.MouseEvent) => {
        // 模态模式下不可调整大小
        if (modal || e.button !== 0 || !resizable) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        resizeDirection.current = direction;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...size };
        startPos.current = { ...pos };
    };

    const onCloseClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClose?.();
    };

    return (
        <>
            {/* 模态对话框遮罩层 */}
            {modal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        zIndex: 1999,
                    }}
                />
            )}
            <div
                ref={panelRef}
                className="ui-panel"
                style={{
                    position: modal ? 'fixed' : 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: size.w,
                    height: autoHeight ? 'auto' : size.h,
                    maxHeight: autoHeight ? 'calc(100vh - 64px)' : undefined,
                    zIndex: modal ? 2000 : 200,
                }}
            >
                <div
                    className={`ui-panel-header ${(!movable || modal) ? 'ui-panel-header-static' : ''}`}
                    onMouseDown={onHeaderDown}
                >
                    <span className="ui-panel-title">{title}</span>
                    {onClose && (
                        <button
                            className="ui-panel-close"
                            onClick={onCloseClick}
                            title="Close"
                        >
                            <IconClose width={14} height={14} />
                        </button>
                    )}
                </div>
                <div className="ui-panel-content">
                    {children}
                </div>
                {/* Resize handles */}
                {resizable && !modal && (
                    <>
                        {/* 右边 */}
                        <div
                            className="ui-panel-resize-handle ui-panel-resize-e"
                            onMouseDown={onResizeDown('e')}
                        />
                        {/* 下边 */}
                        <div
                            className="ui-panel-resize-handle ui-panel-resize-s"
                            onMouseDown={onResizeDown('s')}
                        />
                        {/* 左边 */}
                        <div
                            className="ui-panel-resize-handle ui-panel-resize-w"
                            onMouseDown={onResizeDown('w')}
                        />
                        {/* 右下角 */}
                        <div
                            className="ui-panel-resize-handle ui-panel-resize-se"
                            onMouseDown={onResizeDown('se')}
                        />
                        {/* 左下角 */}
                        <div
                            className="ui-panel-resize-handle ui-panel-resize-sw"
                            onMouseDown={onResizeDown('sw')}
                        />
                    </>
                )}
            </div>
        </>
    );
};
