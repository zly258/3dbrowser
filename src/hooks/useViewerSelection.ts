import { useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { PropertyGroupInput, PropertyGroups } from "../viewer/propertyIndex";
import { buildSelectionPropertyGroups, fetchIfcGroups, resolveSelectionTarget, type ClashSummaryRecord } from "../viewer/selectionDetails";

interface UseViewerSelectionOptions {
    sceneMgrRef: MutableRefObject<SceneManager | null>;
    selectedUuids: string[];
    setSelectedUuids: Dispatch<SetStateAction<string[]>>;
    setSelectedProps: Dispatch<SetStateAction<PropertyGroups | null>>;
    setHiddenUuids: Dispatch<SetStateAction<Set<string>>>;
    setIsolatedUuids: Dispatch<SetStateAction<Set<string>>>;
    updateTree: () => void;
    propOnSelect?: (uuid: string, object: any) => void;
    ifcPropertyCacheRef: RefObject<Map<string, Record<string, PropertyGroupInput>>>;
    clashSummaryByUuid: Record<string, ClashSummaryRecord>;
    t: (key: string) => string;
    isDev?: boolean;
}

export function useViewerSelection({
    sceneMgrRef,
    selectedUuids,
    setSelectedUuids,
    setSelectedProps,
    setHiddenUuids,
    setIsolatedUuids,
    updateTree,
    propOnSelect,
    ifcPropertyCacheRef,
    clashSummaryByUuid,
    t,
    isDev = false
}: UseViewerSelectionOptions) {
    const [locatedUuid, setLocatedUuid] = useState<string | null>(null);
    const [locateResultUuids, setLocateResultUuids] = useState<string[]>([]);

    const resetLocateState = useCallback(() => {
        setLocatedUuid(null);
        setLocateResultUuids([]);
    }, []);

    const handleSelect = useCallback(async (obj: any, _intersect?: THREE.Intersection | null, isMultiSelect = false) => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager) return;

        if (!obj) {
            setSelectedUuids([]);
            setSelectedProps(null);
            sceneManager.highlightObjects([]);
            return;
        }

        const rawUuid = obj.uuid || obj.id;
        const uuid = sceneManager.resolveSelectionUuid(rawUuid);
        if (!uuid) return;

        const nextUuids = isMultiSelect
            ? (selectedUuids.includes(uuid) ? selectedUuids.filter((id) => id !== uuid) : [...selectedUuids, uuid])
            : [uuid];

        setSelectedUuids(nextUuids);
        sceneManager.highlightObjects(nextUuids);

        const focusUuid = nextUuids[nextUuids.length - 1];
        if (!focusUuid) {
            setSelectedProps(null);
            return;
        }

        propOnSelect?.(focusUuid, obj);

        const target = resolveSelectionTarget(sceneManager, obj, focusUuid);
        const ifcGroups = await fetchIfcGroups(target, ifcPropertyCacheRef.current || new Map());
        const selectedGroups = buildSelectionPropertyGroups({
            sceneManager,
            focusUuid,
            target,
            t,
            ifcGroups,
            clashSummary: clashSummaryByUuid[focusUuid],
            isDev
        });

        setSelectedProps(selectedGroups);
    }, [
        clashSummaryByUuid,
        ifcPropertyCacheRef,
        isDev,
        propOnSelect,
        sceneMgrRef,
        selectedUuids,
        setSelectedProps,
        setSelectedUuids,
        t
    ]);

    const handleLocateObject = useCallback((obj: any) => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || !obj) return false;

        const rawUuid = obj.uuid || obj.id;
        if (!rawUuid) return false;

        const uuid = sceneManager.resolveSelectionUuid(rawUuid);
        if (!uuid) return false;

        const bounds = sceneManager.getBoundsForObject(uuid);
        if (!bounds) return false;

        sceneManager.clearLocateFocus();
        sceneManager.fitViewToObject(uuid);
        return true;
    }, [sceneMgrRef]);

    const handleLocateResultsChange = useCallback((uuids: string[]) => {
        const changed = !(locateResultUuids.length === uuids.length && locateResultUuids.every((uuid, index) => uuid === uuids[index]));
        if (!changed) return;

        setLocateResultUuids(uuids);
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || uuids.length > 0) return;

        sceneManager.clearLocateFocus();
    }, [locateResultUuids, sceneMgrRef]);

    const handleClearLocate = useCallback(() => {
        resetLocateState();
        sceneMgrRef.current?.clearLocateFocus();
        sceneMgrRef.current?.highlightObjects(selectedUuids);
    }, [resetLocateState, sceneMgrRef, selectedUuids]);

    return {
        locatedUuid,
        locateResultUuids,
        resetLocateState,
        handleSelect,
        handleLocateObject,
        handleLocateResultsChange,
        handleClearLocate
    };
}
