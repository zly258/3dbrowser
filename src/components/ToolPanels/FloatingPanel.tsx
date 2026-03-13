import React, { useState, useRef, useEffect } from "react";
import { IconClose } from "../../theme/Icons";

// --- 通用浮动面板 ---
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
    styles: any;
    theme: any;
    storageId?: string;
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
    styles,
    theme,
    storageId
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const minWidth = storageId === 'tool_measure' ? 320 : 220;
    const minHeight = storageId === 'tool_measure' ? 400 : 120;

    const [pos, setPos] = useState(() => {
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

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
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
        };

        const handleUp = () => {
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
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };
    }, [size, storageId]);

    const onHeaderDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || !movable) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startPos.current = { ...pos };
    };

    const onResizeDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...size };
    };

    return (
        <div ref={panelRef} style={{ ...styles.floatingPanel, left: pos.x, top: pos.y, width: size.w, height: size.h }}>
            <div style={{ ...styles.floatingHeader, cursor: movable ? 'move' : 'default' }} onMouseDown={onHeaderDown}>
                <span>{title}</span>
                {onClose && (
                    <div
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        style={{ cursor: 'pointer', opacity: 0.8, display: 'flex', padding: 4 }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e81123';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'inherit';
                        }}
                    >
                        <IconClose width={16} height={16} />
                    </div>
                )}
            </div>
            <div style={styles.floatingContent}>
                {children}
            </div>
            {resizable && (
                <div style={styles.resizeHandle} onMouseDown={onResizeDown} />
            )}
        </div>
    );
};
