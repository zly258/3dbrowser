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
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
    title,
    onClose,
    children,
    width = 300,
    height = 200,
    x = 100,
    y = 100,
    resizable = false,
    movable = true,
    storageId,
    modal = false  // 默认非模态模式
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const minWidth = storageId === 'tool_measure' ? 320 : 220;
    const minHeight = storageId === 'tool_measure' ? 400 : 120;

    const [pos, setPos] = useState(() => {
        // 模态模式默认居中 - 模态模式会通过useEffect重新计算
        if (modal) {
            // 初始值，会被useEffect覆盖
            return { x: (window.innerWidth - width) / 2, y: (window.innerHeight - height) / 2 };
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
            const centerY = (window.innerHeight - height) / 2;
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
        return { w: width, h: height };
    });

    // 模态模式下窗口resize时重新居中
    useEffect(() => {
        if (!modal) return;

        const centerPanel = () => {
            const centerX = (window.innerWidth - size.w) / 2;
            const centerY = (window.innerHeight - size.h) / 2;
            setPos({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
        };

        window.addEventListener('resize', centerPanel);
        centerPanel(); // 立即执行一次以确保居中

        return () => {
            window.removeEventListener('resize', centerPanel);
        };
    }, [modal, size.w, size.h]);

    const isDragging = useRef(false);
    const isResizing = useRef(false);
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
            } else if (isResizing.current) {
                setSize({
                    w: Math.max(minWidth, startSize.current.w + dx),
                    h: Math.max(minHeight, startSize.current.h + dy)
                });
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

    const onResizeDown = (e: React.MouseEvent) => {
        // 模态模式下不可调整大小
        if (modal || e.button !== 0 || !resizable) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...size };
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
                    height: size.h,
                    zIndex: modal ? 2000 : 200,
                }}
            >
                <div
                    className="ui-panel-header"
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
                {resizable && !modal && (
                    <div
                        className="ui-panel-resize cursor-se-resize"
                        onMouseDown={onResizeDown}
                    />
                )}
            </div>
        </>
    );
};
