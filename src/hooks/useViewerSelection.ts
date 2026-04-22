import { useCallback, useEffect, useState, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import { createPropertyEntries } from "../viewer/propertyIndex";
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
    focusObjectsInView: (options: {
        uuids: string[];
        focusUuid?: string | null;
        highlightColors?: Record<string, string>;
        updateSelection?: boolean;
    }) => boolean;
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
    focusObjectsInView,
    t,
    isDev = false
}: UseViewerSelectionOptions) {
    const [locatedUuid, setLocatedUuid] = useState<string | null>(null);
    const [locateResultUuids, setLocateResultUuids] = useState<string[]>([]);

    const resetLocateState = useCallback(() => {
        setLocatedUuid(null);
        setLocateResultUuids([]);
    }, []);

    const handleSelect = useCallback(async (obj: any, _intersect?: THREE.Intersection | null, isMultiSelect = false, skipHighlight = false) => {
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
        if (!skipHighlight) {
            sceneManager.highlightObjects(nextUuids);
        }

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

        setLocatedUuid(uuid);
        return focusObjectsInView({ uuids: [uuid], focusUuid: uuid, updateSelection: false });
    }, [focusObjectsInView, sceneMgrRef]);

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

    // 延迟懒加载合并大数量构件属性（防抖 + 切片处理）
    useEffect(() => {
        const sceneManager = sceneMgrRef.current;
        if (!sceneManager || selectedUuids.length <= 1) return;

        let cancelled = false;

        const computeSummaryAsync = async () => {
            // 先在主线程收集边界和几何映射
            const bounds = new THREE.Box3();
            let totalArea = 0;
            let totalVolume = 0;
            const modelNames = new Set<string>();
            const typeCounts = new Map<string, number>();
            const ids = new Set(selectedUuids);

            // 一次性遍历获取目标物体，避免 getObjectByProperty 的 O(K*M) 性能陷阱
            const objectMap = new Map<string, THREE.Object3D>();
            sceneManager.contentGroup.traverse((child) => {
                const uuid = child.uuid;
                const userDataId = child.userData?.id;
                if (ids.has(uuid) || (userDataId && ids.has(userDataId))) {
                    objectMap.set(uuid, child);
                    if (userDataId) objectMap.set(userDataId, child);
                    bounds.expandByObject(child);
                }
            });

            // 异步分块处理类型聚合与几何特征，防止计算堵塞渲染
            const chunkSize = 2000;
            let lastYieldTime = performance.now();

            for (let i = 0; i < selectedUuids.length; i += chunkSize) {
                if (cancelled) return;

                const chunk = selectedUuids.slice(i, i + chunkSize);
                for (const uuid of chunk) {
                    const object = objectMap.get(uuid);
                    const nodes = sceneManager.getStructureNodes(uuid);
                    const node = nodes && nodes.length > 0 ? nodes[0] : null;

                    const type = String(object?.type || node?.type || "Object");
                    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

                    const rootName = object?.userData?.rootName || object?.userData?.modelName;
                    if (rootName) modelNames.add(String(rootName));

                    const geometryData = sceneManager.getObjectGeometryData(uuid);
                    totalArea += geometryData.area;
                    totalVolume += geometryData.volume;
                }

                if (performance.now() - lastYieldTime > 16) {
                    await new Promise(r => setTimeout(r, 0));
                    lastYieldTime = performance.now();
                }
            }

            if (cancelled) return;

            const formatTypeDistribution = (counts: Map<string, number>) =>
                Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([tCount, c]) => `${tCount} x${c}`)
                    .join(", ");

            const size = bounds.isEmpty() ? null : bounds.getSize(new THREE.Vector3());
            const metrics: { key: string, value: string }[] = [
                { key: t("selected_count"), value: String(selectedUuids.length) },
                { key: t("summary_models"), value: String(modelNames.size || 1) },
                { key: t("summary_types"), value: formatTypeDistribution(typeCounts) || "-" }
            ];

            if (size) {
                metrics.push({
                    key: t("summary_bounds"),
                    value: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`
                });
            }
            if (totalArea > 0) {
                metrics.push({ key: t("prop_area"), value: totalArea.toFixed(3) });
            }
            if (totalVolume > 0) {
                metrics.push({ key: t("prop_volume"), value: totalVolume.toFixed(3) });
            }

            const groupName = `${selectedUuids.length} ${t("selected_count")}`;
            setSelectedProps([
                {
                    name: groupName,
                    items: createPropertyEntries(groupName, metrics.map(m => ({ key: m.key, value: m.value })))
                }
            ]);
        };

        const timerId = window.setTimeout(computeSummaryAsync, 200);

        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [selectedUuids, sceneMgrRef, t, setSelectedProps]);

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
