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
    const minWidth = storageId === 'tool_measure'
        ? 320
        : storageId === 'tool_search'
            ? 560
            : 220;
    const minHeight = storageId === 'tool_measure'
        ? 400
        : storageId === 'tool_search'
            ? 480
            : 120;
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
                        return {
                            w: Math.max(minWidth, parsed.size.w),
                            h: Math.max(minHeight, parsed.size.h)
                        };
                    }
                }
            } catch { }
        }
        return { w: width, h: height ?? minHeight };
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
        const pos = posRef.current;
        const size = sizeRef.current;
        panel.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        panel.style.width = `${size.w}px`;
        if (!autoHeight) {
            panel.style.height = `${size.h}px`;
        }
    }, [autoHeight]);

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
    useEffect(() => {
        if (!modal) return;
        const centerPanel = () => {
            const measuredHeight = autoHeight
                ? Math.min(window.innerHeight - 64, panelRef.current?.offsetHeight || sizeRef.current.h)
                : sizeRef.current.h;
            posRef.current = {
                x: Math.max(0, (window.innerWidth - sizeRef.current.w) / 2),
                y: Math.max(0, (window.innerHeight - measuredHeight) / 2)
            };
            applyStyle();
        };
        window.addEventListener('resize', centerPanel);
        centerPanel();
        return () => window.removeEventListener('resize', centerPanel);
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
                />
            )}
            <div
                ref={panelRef}
                className={`ui-panel${modal ? ' ui-panel-modal' : ''}`}
                style={{
                    position: modal ? 'fixed' : 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    width: size.w,
                    height: autoHeight ? 'auto' : viewportLimitedHeight,
                    maxHeight: 'calc(100vh - 64px)',
                    zIndex: modal ? 2000 : 200,
                    willChange: isDragging.current || isResizing.current ? 'transform, width, height' : 'auto',
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
                            title={closeLabel}
                        >
                            <IconClose width={14} height={14} />
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
