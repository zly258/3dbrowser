import { useCallback, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { PropertyGroups } from "../viewer/propertyIndex";

interface ViewerContextMenuState {
    x: number;
    y: number;
    visible: boolean;
}

interface UseViewerVisibilityOptions {
    sceneMgrRef: MutableRefObject<SceneManager | null>;
    selectedUuids: string[];
    setSelectedUuids: Dispatch<SetStateAction<string[]>>;
    setSelectedProps: Dispatch<SetStateAction<PropertyGroups | null>>;
    updateTree: () => void;
    resetLocateState: () => void;
}

const VISIBILITY_BATCH_SIZE = 400;

function nextAnimationFrame() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

export function useViewerVisibility({
    sceneMgrRef,
    selectedUuids,
    setSelectedUuids,
    setSelectedProps,
    updateTree,
    resetLocateState
}: UseViewerVisibilityOptions) {
    const [contextMenu, setContextMenu] = useState<ViewerContextMenuState>({
        x: 0,
        y: 0,
        visible: false
    });
    const [hiddenUuids, setHiddenUuids] = useState<Set<string>>(new Set());
    const [isolatedUuids, setIsolatedUuids] = useState<Set<string>>(new Set());
    const visibilityStackRef = useRef<Array<Array<{ uuid: string; visible: boolean }>>>([]);

    const closeContextMenu = useCallback(() => {
        setContextMenu((prev) => ({ ...prev, visible: false }));
    }, []);

    const handleContextMenu = useCallback((event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            visible: true
        });
    }, []);

    const handleHideSelected = useCallback(() => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || selectedUuids.length === 0) return;

        const stateToRestore = selectedUuids.map((uuid) => {
            const object = sceneManager.contentGroup.getObjectByProperty("uuid", uuid);
            return { uuid, visible: object ? object.visible : true };
        });
        visibilityStackRef.current.push(stateToRestore);
        const uuidsToHide = [...selectedUuids];

        setSelectedUuids([]);
        setSelectedProps(null);
        sceneManager.highlightObjects([]);
        closeContextMenu();

        void (async () => {
            for (let index = 0; index < uuidsToHide.length; index += VISIBILITY_BATCH_SIZE) {
                const chunk = uuidsToHide.slice(index, index + VISIBILITY_BATCH_SIZE);
                const isLastChunk = index + VISIBILITY_BATCH_SIZE >= uuidsToHide.length;
                sceneManager.setObjectsVisibility(chunk, false, { deferRefresh: !isLastChunk });
                if (index + VISIBILITY_BATCH_SIZE < uuidsToHide.length) {
                    await nextAnimationFrame();
                }
            }

            const nextHiddenUuids = new Set(hiddenUuids);
            const nextIsolatedUuids = new Set(isolatedUuids);
            uuidsToHide.forEach((uuid) => {
                nextHiddenUuids.add(uuid);
                nextIsolatedUuids.delete(uuid);
            });

            setHiddenUuids(nextHiddenUuids);
            setIsolatedUuids(nextIsolatedUuids);
            updateTree();
        })();
    }, [
        closeContextMenu,
        hiddenUuids,
        isolatedUuids,
        sceneMgrRef,
        selectedUuids,
        setSelectedProps,
        setSelectedUuids,
        updateTree
    ]);

    const handleShowAll = useCallback(() => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager) return;

        if (hiddenUuids.size > 0 || isolatedUuids.size > 0) {
            sceneManager.setAllVisibility(true);
            setHiddenUuids(new Set());
            setIsolatedUuids(new Set());
            updateTree();
        }
        resetLocateState();
        sceneManager.clearLocateFocus();
        closeContextMenu();
    }, [closeContextMenu, hiddenUuids, isolatedUuids, resetLocateState, sceneMgrRef, updateTree]);

    const handleToggleVisibility = useCallback((uuid: string, visible: boolean) => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager) return;

        visibilityStackRef.current.push([{ uuid, visible: !visible }]);
        sceneManager.setObjectVisibility(uuid, visible);

        const nextHiddenUuids = new Set(hiddenUuids);
        if (visible) {
            nextHiddenUuids.delete(uuid);
        } else {
            nextHiddenUuids.add(uuid);
        }
        setHiddenUuids(nextHiddenUuids);
        updateTree();
    }, [hiddenUuids, sceneMgrRef, updateTree]);

    const handleHideObject = useCallback((uuid: string) => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager) return;

        visibilityStackRef.current.push([{ uuid, visible: true }]);
        sceneManager.setObjectVisibility(uuid, false);
        setHiddenUuids((prev) => new Set(prev).add(uuid));
        setSelectedUuids((prev) => prev.filter((id) => id !== uuid));
        updateTree();
    }, [sceneMgrRef, setSelectedUuids, updateTree]);

    const handleIsolateObject = useCallback((uuid: string) => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager) return;

        sceneManager.isolateObjects([uuid]);
        setHiddenUuids(new Set());
        setIsolatedUuids(new Set([uuid]));
        setSelectedUuids([uuid]);
        sceneManager.highlightObjects([uuid]);
        updateTree();
        closeContextMenu();
    }, [closeContextMenu, sceneMgrRef, setSelectedUuids, updateTree]);

    const handleIsolateSelection = useCallback(() => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || selectedUuids.length === 0) return;

        const nextIsolated = selectedUuids.filter((id) => !isolatedUuids.has(id));
        if (nextIsolated.length > 0) {
            sceneManager.isolateObjects(selectedUuids);
            setIsolatedUuids(new Set([...isolatedUuids, ...nextIsolated]));
            setHiddenUuids(new Set());
            updateTree();
        }
        closeContextMenu();
    }, [closeContextMenu, isolatedUuids, sceneMgrRef, selectedUuids, updateTree]);

    const handleUndoVisibility = useCallback(() => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || visibilityStackRef.current.length === 0) return;

        const lastAction = visibilityStackRef.current.pop();
        if (!lastAction) return;

        sceneManager.applyVisibilityBatch(lastAction, {
            recomputeBounds: true,
            refreshExplode: false,
            invalidateInteractables: true
        });

        const nextHiddenUuids = new Set(hiddenUuids);
        lastAction.forEach((change) => {
            if (change.visible) {
                nextHiddenUuids.delete(change.uuid);
            } else {
                nextHiddenUuids.add(change.uuid);
            }
        });
        setHiddenUuids(nextHiddenUuids);
        updateTree();
    }, [hiddenUuids, sceneMgrRef, updateTree]);

    return {
        contextMenu,
        hiddenUuids,
        isolatedUuids,
        setHiddenUuids,
        setIsolatedUuids,
        handleContextMenu,
        closeContextMenu,
        handleHideSelected,
        handleShowAll,
        handleToggleVisibility,
        handleHideObject,
        handleIsolateObject,
        handleIsolateSelection,
        handleUndoVisibility
    };
}
