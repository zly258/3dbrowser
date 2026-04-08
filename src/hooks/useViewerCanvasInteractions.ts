import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { MeasureType } from "../utils/scene-manager/types";
import type { PropertyGroups } from "../viewer/propertyIndex";

interface UseViewerCanvasInteractionsOptions {
    sceneMgrRef: MutableRefObject<SceneManager | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    activeTool: string;
    setActiveTool: Dispatch<SetStateAction<string>>;
    measureType: MeasureType;
    setMeasureType: Dispatch<SetStateAction<MeasureType>>;
    pickEnabled: boolean;
    selectedUuids: string[];
    setSelectedUuids: Dispatch<SetStateAction<string[]>>;
    setSelectedProps: Dispatch<SetStateAction<PropertyGroups | null>>;
    setMousePos: Dispatch<SetStateAction<THREE.Vector3 | null>>;
    setHighlightedMeasureId: Dispatch<SetStateAction<string | null>>;
    handleSelect: (obj: any, intersect?: THREE.Intersection | null, isMultiSelect?: boolean) => void | Promise<void>;
    handleContextMenu: (event: MouseEvent) => void;
    handleUndoVisibility: () => void;
    clearSelectionState: () => void;
}

export function useViewerCanvasInteractions({
    sceneMgrRef,
    canvasRef,
    activeTool,
    setActiveTool,
    measureType,
    setMeasureType,
    pickEnabled,
    selectedUuids,
    setSelectedUuids,
    setSelectedProps,
    setMousePos,
    setHighlightedMeasureId,
    handleSelect,
    handleContextMenu,
    handleUndoVisibility,
    clearSelectionState
}: UseViewerCanvasInteractionsOptions) {
    const pointerDownRef = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
    const mouseMoveRafRef = useRef<number | null>(null);
    const pendingMousePointRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const manager = sceneMgrRef.current;
        const canvas = canvasRef.current;
        if (!manager || !canvas) return;

        const clickMoveThreshold = 6;

        const handleMouseDown = (event: MouseEvent) => {
            pointerDownRef.current = {
                x: event.clientX,
                y: event.clientY,
                moved: false,
                button: event.button
            };
        };

        const handleClick = (event: MouseEvent) => {
            const pointerState = pointerDownRef.current;
            if (!pointerState || pointerState.button !== 0 || pointerState.moved) {
                pointerDownRef.current = null;
                return;
            }
            pointerDownRef.current = null;

            if (activeTool === "boxSelect") return;

            if (activeTool === "measure") {
                if (measureType !== "none") {
                    const intersect = manager.getRayIntersects(event.clientX, event.clientY);
                    if (intersect) {
                        const modelUuid = (intersect.object as any).uuid;
                        manager.addMeasurePoint(intersect.point, modelUuid);
                        return;
                    }
                }

                const measurementId = manager.pickMeasurement(event.clientX, event.clientY);
                if (measurementId) {
                    setHighlightedMeasureId(measurementId);
                    manager.highlightMeasurement(measurementId);
                    return;
                }

                setHighlightedMeasureId(null);
                manager.highlightMeasurement(null);
                return;
            }

            if (pickEnabled) {
                const result = manager.pick(event.clientX, event.clientY);
                void handleSelect(result ? result.object : null, result ? result.intersect : null, event.ctrlKey);
            }
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (pointerDownRef.current && !pointerDownRef.current.moved) {
                const dx = event.clientX - pointerDownRef.current.x;
                const dy = event.clientY - pointerDownRef.current.y;
                if ((dx * dx + dy * dy) > (clickMoveThreshold * clickMoveThreshold)) {
                    pointerDownRef.current.moved = true;
                }
            }

            if (activeTool === "measure") {
                manager.updateMeasureHover(event.clientX, event.clientY);
                setMousePos(null);
                return;
            }

            if (event.buttons !== 0) {
                pendingMousePointRef.current = null;
                if (mouseMoveRafRef.current !== null) {
                    cancelAnimationFrame(mouseMoveRafRef.current);
                    mouseMoveRafRef.current = null;
                }
                setMousePos(null);
                return;
            }

            pendingMousePointRef.current = { x: event.clientX, y: event.clientY };
            if (mouseMoveRafRef.current !== null) return;

            mouseMoveRafRef.current = requestAnimationFrame(() => {
                mouseMoveRafRef.current = null;
                const pending = pendingMousePointRef.current;
                if (!pending) return;
                const intersect = manager.getRayIntersects(pending.x, pending.y);
                setMousePos(intersect ? intersect.point : null);
            });
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.key === "z" || event.key === "Z") && (event.ctrlKey || event.metaKey)) {
                handleUndoVisibility();
                return;
            }
            if (event.key === "Escape") {
                if (activeTool === "measure" && measureType !== "none") {
                    setMeasureType("none");
                    manager.startMeasurement("none");
                }
                if (activeTool === "boxSelect") {
                    manager.cancelBoxSelect();
                    setActiveTool("none");
                }
                clearSelectionState();
            }
        };

        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("click", handleClick);
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("contextmenu", handleContextMenu);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            if (mouseMoveRafRef.current !== null) {
                cancelAnimationFrame(mouseMoveRafRef.current);
                mouseMoveRafRef.current = null;
            }
            pendingMousePointRef.current = null;
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("click", handleClick);
            canvas.removeEventListener("mousemove", handleMouseMove);
            canvas.removeEventListener("contextmenu", handleContextMenu);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        activeTool,
        canvasRef,
        clearSelectionState,
        handleContextMenu,
        handleSelect,
        handleUndoVisibility,
        measureType,
        pickEnabled,
        sceneMgrRef,
        setActiveTool,
        setHighlightedMeasureId,
        setMeasureType,
        setMousePos
    ]);

    useEffect(() => {
        const manager = sceneMgrRef.current;
        const canvas = canvasRef.current;
        if (!manager || !canvas || activeTool !== "boxSelect") return;

        manager.controls.mouseButtons.LEFT = undefined as any;

        const onPointerDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            manager.startBoxSelect(event.clientX, event.clientY);
        };

        const onPointerMove = (event: PointerEvent) => {
            manager.updateBoxSelect(event.clientX, event.clientY);
        };

        const onPointerUp = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const uuids = manager.endBoxSelect();
            if (uuids.length > 0) {
                const nextUuids = event.shiftKey
                    ? [...new Set([...selectedUuids, ...uuids])]
                    : uuids;
                setSelectedUuids(nextUuids);
                setSelectedProps(null);
                manager.highlightObjects(nextUuids);
            }
        };

        canvas.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);

        return () => {
            canvas.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            if (manager.controls) {
                manager.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            }
            manager.cancelBoxSelect();
        };
    }, [activeTool, canvasRef, sceneMgrRef, selectedUuids, setSelectedProps, setSelectedUuids]);
}
