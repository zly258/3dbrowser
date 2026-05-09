import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { SceneManager } from "../utils/scene-manager/SceneManager";
import type { PropertyGroups } from "../viewer/propertyIndex";

interface FocusInViewOptions {
  sceneMgrRef: MutableRefObject<SceneManager | null>;
  setSelectedUuids: Dispatch<SetStateAction<string[]>>;
  setSelectedProps?: Dispatch<SetStateAction<PropertyGroups | null>>;
  isolateLocate?: boolean;
  onIsolateLocate?: (uuids: string[]) => void;
}

interface FocusRequest {
  uuids: string[];
  focusUuid?: string | null;
  highlightColors?: Record<string, string>;
  updateSelection?: boolean;
}

export function useFocusInView({
  sceneMgrRef,
  setSelectedUuids,
  setSelectedProps,
  isolateLocate = false,
  onIsolateLocate
}: FocusInViewOptions) {
  const focusObjectsInView = useCallback(({
    uuids,
    focusUuid,
    highlightColors,
    updateSelection = true
  }: FocusRequest) => {
    const sceneManager = sceneMgrRef.current;
    if (!sceneManager) return false;

    const normalized = Array.from(new Set((uuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean)));
    if (normalized.length === 0) return false;

    const targetFocus = focusUuid && normalized.includes(focusUuid) ? focusUuid : normalized[0];

    if (isolateLocate) {
      sceneManager.isolateObjects(normalized);
      onIsolateLocate?.(normalized);
    }

    // 统一高亮入口：高亮目标 + 背景灰化 + 飞到目标
    sceneManager.focusHighlightObjects(normalized, {
      fitView: true,
      focusUuid: targetFocus,
      highlightColors
    });

    if (updateSelection) {
      setSelectedUuids(normalized);
      setSelectedProps?.(null);
    }

    return true;
  }, [isolateLocate, onIsolateLocate, sceneMgrRef, setSelectedProps, setSelectedUuids]);

  return {
    focusObjectsInView
  };
}
