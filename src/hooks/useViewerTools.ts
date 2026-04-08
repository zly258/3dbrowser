import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SceneManager, MeasureType, SceneSettings, MeasurementRecord } from "../utils/scene-manager/SceneManager";
import { usePersistentState } from "./usePersistentState";

export type ViewerTool =
    | "none"
    | "measure"
    | "clip"
    | "settings"
    | "export"
    | "screenshot"
    | "viewpoint"
    | "search"
    | "boxSelect"
    | "explode"
    | "clash";

export type ExplodeMode = "radial" | "horizontal" | "vertical";

export interface MeasureHistoryItem {
    id: string;
    type: string;
    val: string;
}

export interface ClipRangeValues {
    x: number[];
    y: number[];
    z: number[];
}

export interface ClipAxisActiveState {
    x: boolean;
    y: boolean;
    z: boolean;
}

interface UseViewerToolsOptions {
    initialSettings?: Partial<SceneSettings>;
    mgrInstance: SceneManager | null;
}

const DEFAULT_CLIP_VALUES: ClipRangeValues = { x: [0, 100], y: [0, 100], z: [0, 100] };
const DEFAULT_CLIP_ACTIVE: ClipAxisActiveState = { x: false, y: false, z: false };

export function useViewerTools({ initialSettings, mgrInstance }: UseViewerToolsOptions) {
    const [activeTool, setActiveTool] = useState<ViewerTool>("none");
    const [explodeEnabled, setExplodeEnabled] = useState(false);
    const [explodeStrength, setExplodeStrength] = useState(32);
    const [explodeMode, setExplodeMode] = useState<ExplodeMode>("radial");
    const [measureType, setMeasureType] = useState<MeasureType>("none");
    const [measureHistory, setMeasureHistory] = useState<MeasureHistoryItem[]>([]);
    const [highlightedMeasureId, setHighlightedMeasureId] = useState<string | null>(null);
    const [clipEnabled, setClipEnabled] = useState(false);
    const [clipValues, setClipValues] = useState<ClipRangeValues>(DEFAULT_CLIP_VALUES);
    const [clipActive, setClipActive] = useState<ClipAxisActiveState>(DEFAULT_CLIP_ACTIVE);
    const [clipHelperVisible, setClipHelperVisible] = usePersistentState<boolean>(
        "3dbrowser_clipHelperVisible",
        initialSettings?.clip?.helperVisible ?? false,
        {
            serializer: (value) => String(value),
            parser: (raw) => raw === "true"
        }
    );
    const [clipHelperOpacity, setClipHelperOpacity] = usePersistentState<number>(
        "3dbrowser_clipHelperOpacity",
        initialSettings?.clip?.helperOpacity ?? 0.12,
        {
            serializer: (value) => String(value),
            parser: (raw) => {
                const parsed = Number(raw);
                return Number.isFinite(parsed) ? parsed : 0.12;
            }
        }
    );

    const normalizedClipHelperOpacity = useMemo(
        () => Math.min(0.35, Math.max(0.05, clipHelperOpacity)),
        [clipHelperOpacity]
    );

    useEffect(() => {
        if (normalizedClipHelperOpacity !== clipHelperOpacity) {
            setClipHelperOpacity(normalizedClipHelperOpacity);
        }
    }, [clipHelperOpacity, normalizedClipHelperOpacity, setClipHelperOpacity]);

    useEffect(() => {
        if (!mgrInstance) return;
        mgrInstance.setClipHelperOptions({
            visible: clipHelperVisible,
            opacity: normalizedClipHelperOpacity
        });
    }, [clipHelperVisible, mgrInstance, normalizedClipHelperOpacity]);

    useEffect(() => {
        if (!mgrInstance) return;

        if (activeTool !== "measure") {
            mgrInstance.clearMeasurementPreview();
            mgrInstance.highlightMeasurement(null);
            setHighlightedMeasureId(null);
            setMeasureType("none");
        }

        if (activeTool !== "clip") {
            mgrInstance.setClippingEnabled(false);
            setClipEnabled(false);
        }
    }, [activeTool, mgrInstance]);

    useEffect(() => {
        if (!mgrInstance || activeTool !== "clip") return;

        mgrInstance.setClippingEnabled(clipEnabled);
        if (!clipEnabled) return;

        let bounds = mgrInstance.computeTotalBounds(true);
        if (bounds.isEmpty()) {
            bounds = mgrInstance.computeTotalBounds(false);
        }

        if (!bounds.isEmpty()) {
            mgrInstance.updateClippingPlanes(bounds, clipValues, clipActive);
        }
    }, [activeTool, clipActive, clipEnabled, clipValues, mgrInstance]);

    useEffect(() => {
        if (!mgrInstance) return;
        mgrInstance.startMeasurement(measureType);
    }, [measureType, mgrInstance]);

    useEffect(() => {
        if (!mgrInstance) return;
        mgrInstance.setExplodeEnabled(explodeEnabled);
    }, [explodeEnabled, mgrInstance]);

    useEffect(() => {
        if (!mgrInstance) return;
        mgrInstance.setExplodeStrength(explodeStrength);
    }, [explodeStrength, mgrInstance]);

    useEffect(() => {
        if (!mgrInstance) return;
        mgrInstance.setExplodeMode(explodeMode);
    }, [explodeMode, mgrInstance]);

    const resetExplodeState = () => {
        setExplodeEnabled(false);
        setExplodeStrength(32);
        setExplodeMode("radial");
    };

    const resetMeasurementState = () => {
        setMeasureHistory([]);
        setHighlightedMeasureId(null);
        setMeasureType("none");
    };

    const handleMeasureUpdate = (records: MeasurementRecord[]) => {
        setMeasureHistory(records.map((record) => ({ id: record.id, type: record.type, val: record.val })));
    };

    return {
        activeTool,
        setActiveTool,
        explodeEnabled,
        setExplodeEnabled,
        explodeStrength,
        setExplodeStrength,
        explodeMode,
        setExplodeMode,
        resetExplodeState,
        measureType,
        setMeasureType,
        measureHistory,
        setMeasureHistory,
        highlightedMeasureId,
        setHighlightedMeasureId,
        resetMeasurementState,
        handleMeasureUpdate,
        clipEnabled,
        setClipEnabled,
        clipValues,
        setClipValues,
        clipActive,
        setClipActive,
        clipHelperVisible,
        setClipHelperVisible,
        clipHelperOpacity: normalizedClipHelperOpacity,
        setClipHelperOpacity
    };
}
