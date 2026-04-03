import { useCallback, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { SceneManager } from "../utils/SceneManager";
import { createPropertyEntries, normalizePropertyToken, type PropertyEntry, type PropertyGroupInput } from "./propertyIndex";

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

type SearchCandidate = {
  uuid: string;
  name: string;
  source: THREE.Object3D;
};

function appendPropertyEntries(
  entries: PropertyEntry[],
  groupName: string,
  value: PropertyGroupInput | null | undefined,
  source?: string
) {
  if (!value) return;
  entries.push(...createPropertyEntries(groupName, value, source));
}

function flattenNestedRecord(
  groupName: string,
  input: Record<string, any>,
  entries: PropertyEntry[],
  source: string
) {
  Object.entries(input).forEach(([key, value]) => {
    if (Array.isArray(value) || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      appendPropertyEntries(entries, groupName, [{ key, value, source }], source);
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, any>).forEach(([subKey, subValue]) => {
        appendPropertyEntries(entries, groupName, [{ key: `${key}.${subKey}`, value: subValue, rawKey: subKey, source }], source);
      });
    }
  });
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

  const buildSearchPropertyEntries = useCallback((uuid: string, obj: THREE.Object3D) => {
    const entries: PropertyEntry[] = [];

    appendPropertyEntries(entries, "Object", [
      { key: "name", value: obj?.name, source: "object" },
      { key: "type", value: obj?.type, source: "object" },
      { key: "uuid", value: uuid, source: "object" },
      { key: "bimid", value: sceneMgrRef.current?.getBimIdByUuid(uuid) || "", source: "object" }
    ]);

    const userData = (obj?.userData || {}) as Record<string, any>;
    Object.entries(userData).forEach(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        appendPropertyEntries(entries, "UserData", [{ key, value, source: "userData" }], "userData");
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          appendPropertyEntries(entries, "UserData", [{ key, value: item, id: `userData::${key}::${index}`, source: "userData" }], "userData");
        });
      }
    });

    const ifcMeta = (obj?.userData?.ifcMetadata || {}) as Record<string, any>;
    flattenNestedRecord("IFC Metadata", ifcMeta, entries, "ifcMetadata");

    const nbimProps = sceneMgrRef.current?.getNbimProperties(uuid);
    if (nbimProps && typeof nbimProps === "object") {
      flattenNestedRecord("NBIM", nbimProps as Record<string, any>, entries, "nbim");
    }

    const nbimIfcGroups = sceneMgrRef.current?.getNbimIfcPropertyGroups(uuid, "normalized");
    if (nbimIfcGroups && typeof nbimIfcGroups === "object") {
      Object.entries(nbimIfcGroups).forEach(([groupName, groupEntries]) => {
        appendPropertyEntries(entries, groupName, groupEntries as PropertyGroupInput, "nbim-ifc");
      });
    }

    return entries;
  }, [sceneMgrRef]);

  const collectSearchCandidates = useCallback(() => {
    const candidates: SearchCandidate[] = [];
    const visited = new Set<string>();
    const sceneMgr = sceneMgrRef.current;
    if (!sceneMgr) return candidates;

    sceneMgr.contentGroup.updateMatrixWorld(true);
    sceneMgr.contentGroup.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      if (mesh.userData?.isIfcGridHelper) return;
      if (visited.has(mesh.uuid)) return;
      visited.add(mesh.uuid);
      candidates.push({
        uuid: mesh.uuid,
        name: mesh.name || mesh.uuid,
        source: mesh
      });
    });

    const walkNodes = (nodes: any[]) => {
      nodes.forEach((node) => {
        if (!node || node.visible === false) return;
        const id = String(node.id || "");
        if (id && node.bimId && !visited.has(id)) {
          visited.add(id);
          candidates.push({
            uuid: id,
            name: String(node.name || id),
            source: {
              name: node.name,
              type: node.type,
              userData: node.userData || {}
            } as THREE.Object3D
          });
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          walkNodes(node.children);
        }
      });
    };

    if (Array.isArray(sceneMgr.structureRoot?.children) && sceneMgr.structureRoot.children.length > 0) {
      walkNodes(sceneMgr.structureRoot.children as any[]);
    }

    return candidates;
  }, [sceneMgrRef]);

  const evaluateCondition = useCallback((value: string, operator: SearchOperator, query: string) => {
    if (operator === "equals") return value === query;
    if (operator === "contains") return value.includes(query);
    if (operator === "notContains") return !value.includes(query);
    if (operator === "startsWith") return value.startsWith(query);
    if (operator === "endsWith") return value.endsWith(query);
    return false;
  }, []);

  const matchesPropertyName = useCallback((entry: PropertyEntry, query: string) => {
    if (!query) return false;
    return entry.normalizedKey === query
      || entry.normalizedPath === query
      || (!!entry.rawKey && normalizePropertyToken(entry.rawKey) === query)
      || entry.normalizedPath.endsWith(`.${query}`);
  }, []);

  const handleRunPropertySearch = useCallback(async () => {
    if (!sceneMgrRef.current) return;
    if (searchInFlightRef.current) return;

    const normalizedConditions = searchConditions
      .map((item) => ({
        ...item,
        normalizedPropertyName: normalizePropertyToken(item.propertyName),
        normalizedValue: normalizePropertyToken(item.value)
      }))
      .filter((item) => item.normalizedPropertyName && item.normalizedValue);

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
        const entries = buildSearchPropertyEntries(item.uuid, item.source);

        let result: boolean | null = null;
        const matchedBy = new Set<string>();
        normalizedConditions.forEach((condition, index) => {
          const matchedEntries = entries.filter((entry) => matchesPropertyName(entry, condition.normalizedPropertyName));
          const matched = matchedEntries.some((entry) => evaluateCondition(entry.normalizedValue, condition.operator, condition.normalizedValue));
          if (matched) {
            matchedEntries.forEach((entry) => {
              if (evaluateCondition(entry.normalizedValue, condition.operator, condition.normalizedValue)) {
                matchedBy.add(entry.path);
              }
            });
          }

          if (index === 0 || result === null) result = matched;
          else if ((condition.connector || "AND") === "AND") result = Boolean(result) && matched;
          else result = Boolean(result) || matched;
        });

        if (result) {
          nextResults.push({
            uuid: item.uuid,
            name: item.name || item.uuid,
            matchedBy: Array.from(matchedBy)
          });
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
        sceneMgrRef.current.highlightObjects(nextResults.map((resultItem) => resultItem.uuid));
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
  }, [buildSearchPropertyEntries, collectSearchCandidates, evaluateCondition, matchesPropertyName, sceneMgrRef, searchConditions, selectedUuids, setToast, t]);

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
