import { useCallback, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { SceneManager } from "../utils/SceneManager";

export type SearchOperator = "equals" | "contains" | "notContains" | "startsWith" | "endsWith";
export type SearchConnector = "AND" | "OR";

export type PropertySearchCondition = {
  id: string;
  propertyName: string;
  operator: SearchOperator;
  value: string;
  connector?: SearchConnector;
};

export type PropertySearchResultItem = {
  uuid: string;
  name: string;
  matchedBy: string[];
};

interface UsePropertySearchParams {
  sceneMgrRef: MutableRefObject<SceneManager | null>;
  selectedUuids: string[];
  setSelectedUuids: (next: string[]) => void;
  onSelectObject: (obj: any) => Promise<void> | void;
  t: (key: string) => string;
  setToast: (payload: { message: string; type: "info" | "success" | "error" }) => void;
}

export function usePropertySearch({
  sceneMgrRef,
  selectedUuids,
  setSelectedUuids,
  onSelectObject,
  t,
  setToast
}: UsePropertySearchParams) {
  const [searchConditions, setSearchConditions] = useState<PropertySearchCondition[]>([
    { id: "cond_init", propertyName: "", operator: "contains", value: "" }
  ]);
  const [searchResults, setSearchResults] = useState<PropertySearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState("");
  const searchRunTokenRef = useRef(0);
  const searchInFlightRef = useRef(false);

  const buildSearchPropertyBag = useCallback((uuid: string, obj: any) => {
    const bag = new Map<string, string[]>();
    const addValue = (key: string, value: any) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey) return;
      if (value === undefined || value === null) return;
      const normalizedValue = String(value).trim();
      if (!normalizedValue) return;
      const next = bag.get(normalizedKey) || [];
      next.push(normalizedValue);
      bag.set(normalizedKey, next);
    };

    addValue("name", obj?.name);
    addValue("type", obj?.type);
    addValue("uuid", uuid);
    addValue("bimid", sceneMgrRef.current?.getBimIdByUuid(uuid) || "");

    const userData = (obj?.userData || {}) as Record<string, any>;
    Object.entries(userData).forEach(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        addValue(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((item) => addValue(key, item));
      }
    });

    const ifcMeta = (obj?.userData?.ifcMetadata || {}) as Record<string, any>;
    Object.entries(ifcMeta).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => addValue(key, item));
      } else {
        addValue(key, value);
      }
    });

    const nbimProps = sceneMgrRef.current?.getNbimProperties(uuid);
    if (nbimProps && typeof nbimProps === "object") {
      Object.entries(nbimProps).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => addValue(key, item));
        } else if (typeof value === "object" && value) {
          Object.entries(value as Record<string, any>).forEach(([subKey, subValue]) => {
            addValue(`${key}.${subKey}`, subValue);
            addValue(subKey, subValue);
          });
        } else {
          addValue(key, value);
        }
      });
    }

    const nbimIfcGroups = sceneMgrRef.current?.getNbimIfcPropertyGroups(uuid, "normalized");
    if (nbimIfcGroups && typeof nbimIfcGroups === "object") {
      Object.entries(nbimIfcGroups).forEach(([groupName, groupEntries]) => {
        if (!groupEntries || typeof groupEntries !== "object") return;
        Object.entries(groupEntries).forEach(([fieldKey, fieldValue]) => {
          addValue(fieldKey, fieldValue);
          addValue(`${groupName}.${fieldKey}`, fieldValue);
        });
      });
    }

    return bag;
  }, [sceneMgrRef]);

  const collectSearchCandidates = useCallback(() => {
    const candidates: Array<{ uuid: string; name: string; source: any }> = [];
    const visited = new Set<string>();

    const walk = (nodes: any[]) => {
      nodes.forEach((node) => {
        const id = String(node?.id || node?.uuid || "");
        if (!id || visited.has(id)) return;
        visited.add(id);
        const type = String(node?.type || "").toLowerCase();
        if (type === "mesh" || node?.bimId || node?.userData?.bimId) {
          candidates.push({
            uuid: id,
            name: node?.name || id,
            source: node
          });
        }
        if (Array.isArray(node?.children) && node.children.length > 0) {
          walk(node.children);
        }
      });
    };

    const root = sceneMgrRef.current?.structureRoot;
    if (root?.children?.length) {
      walk(root.children as any[]);
    }

    if (candidates.length === 0 && sceneMgrRef.current) {
      sceneMgrRef.current.contentGroup.traverse((obj: THREE.Object3D) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        if (visited.has(obj.uuid)) return;
        visited.add(obj.uuid);
        candidates.push({
          uuid: obj.uuid,
          name: obj.name || obj.uuid,
          source: obj
        });
      });
    }

    return candidates;
  }, [sceneMgrRef]);

  const evaluateCondition = useCallback((values: string[], operator: SearchOperator, query: string) => {
    const normalizedQuery = query.toLowerCase();
    return values.some((raw) => {
      const value = raw.toLowerCase();
      if (operator === "equals") return value === normalizedQuery;
      if (operator === "contains") return value.includes(normalizedQuery);
      if (operator === "notContains") return !value.includes(normalizedQuery);
      if (operator === "startsWith") return value.startsWith(normalizedQuery);
      if (operator === "endsWith") return value.endsWith(normalizedQuery);
      return false;
    });
  }, []);

  const handleRunPropertySearch = useCallback(async () => {
    if (!sceneMgrRef.current) return;
    if (searchInFlightRef.current) return;

    const normalizedConditions = searchConditions.filter((item) => item.propertyName.trim() && item.value.trim());
    if (normalizedConditions.length === 0) {
      setSearchResults([]);
      setSearching(false);
      setSearchProgress(0);
      setSearchStatus("");
      setToast({ message: t("search_invalid_condition") || "请至少输入一组完整的搜索条件", type: "info" });
      sceneMgrRef.current.highlightObjects(selectedUuids);
      return;
    }

    const runToken = ++searchRunTokenRef.current;
    const searchStartAt = performance.now();
    searchInFlightRef.current = true;
    setSearching(true);
    setSearchProgress(0);
    setSearchStatus(t("searching") || "搜索中...");

    try {
      const candidates = collectSearchCandidates();
      const total = candidates.length;
      const batchSize = 600;
      const nextResults: PropertySearchResultItem[] = [];
      let lastProgressAt = performance.now();
      let cancelled = false;

      for (let i = 0; i < candidates.length; i++) {
        if (searchRunTokenRef.current !== runToken) {
          cancelled = true;
          setSearchStatus(t("search_cancelled") || "搜索已取消");
          break;
        }
        const item = candidates[i];
        const uuid = item.uuid;
        const bag = buildSearchPropertyBag(uuid, item.source);

        let result: boolean | null = null;
        const matchedBy: string[] = [];
        normalizedConditions.forEach((condition, index) => {
          const key = condition.propertyName.trim().toLowerCase();
          const values = bag.get(key) || [];
          const matched = values.length > 0
            ? evaluateCondition(values, condition.operator, condition.value.trim())
            : false;
          if (matched) matchedBy.push(condition.propertyName.trim());
          if (index === 0 || result === null) result = matched;
          else if ((condition.connector || "AND") === "AND") result = Boolean(result) && matched;
          else result = Boolean(result) || matched;
        });

        if (result) {
          nextResults.push({ uuid, name: item.name || uuid, matchedBy: Array.from(new Set(matchedBy)) });
        }

        if ((i + 1) % batchSize === 0 || i === candidates.length - 1) {
          const now = performance.now();
          const progress = total > 0 ? ((i + 1) / total) * 100 : 100;
          if (now - lastProgressAt > 120 || i === candidates.length - 1) {
            setSearchProgress(progress);
            lastProgressAt = now;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (!cancelled) {
        setSearchResults(nextResults);
        sceneMgrRef.current.highlightObjects(nextResults.map((item) => item.uuid));
        setSearchProgress(100);
        setSearchStatus(`${t("search_results") || "结果"}: ${nextResults.length}`);
      }
    } finally {
      const elapsed = performance.now() - searchStartAt;
      const minVisibleMs = 220;
      if (elapsed < minVisibleMs) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, minVisibleMs - elapsed));
      }
      setSearching(false);
      searchInFlightRef.current = false;
    }
  }, [buildSearchPropertyBag, collectSearchCandidates, evaluateCondition, sceneMgrRef, searchConditions, selectedUuids, setToast, t]);

  const handleApplySearchResultHighlight = useCallback((uuid: string) => {
    if (!sceneMgrRef.current) return;
    const target = sceneMgrRef.current.contentGroup.getObjectByProperty("uuid", uuid);
    sceneMgrRef.current.fitViewToObject(uuid);
    if (target) {
      void onSelectObject(target);
      return;
    }
    setSelectedUuids([uuid]);
    sceneMgrRef.current.highlightObjects([uuid]);
  }, [onSelectObject, sceneMgrRef, setSelectedUuids]);

  const handleClearSearchResult = useCallback(() => {
    searchRunTokenRef.current++;
    setSearchResults([]);
    setSearching(false);
    setSearchProgress(0);
    setSearchStatus("");
    searchInFlightRef.current = false;
    if (!sceneMgrRef.current) return;
    sceneMgrRef.current.highlightObjects(selectedUuids);
  }, [sceneMgrRef, selectedUuids]);

  const handleCancelSearch = useCallback(() => {
    if (!searchInFlightRef.current) return;
    searchRunTokenRef.current++;
    setSearchStatus(t("search_cancelling") || "正在取消搜索...");
  }, [t]);

  return {
    searchConditions,
    setSearchConditions,
    searchResults,
    searching,
    searchProgress,
    searchStatus,
    handleRunPropertySearch,
    handleApplySearchResultHighlight,
    handleClearSearchResult,
    handleCancelSearch
  };
}
