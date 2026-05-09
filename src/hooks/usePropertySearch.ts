import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { SceneManager } from "../utils/scene-manager/SceneManager";
import { createPropertyEntries, normalizePropertyToken, type PropertyEntry, type PropertyGroupInput } from "../viewer/propertyIndex";

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
  type: string;
  modelId: string;
  source: string;
  matchedBy: string[];
};

export type PropertyFieldOption = {
  value: string;
  label: string;
  count?: number;
};

interface UsePropertySearchParams {
  sceneMgrRef: MutableRefObject<SceneManager | null>;
  selectedUuids: string[];
  setSelectedUuids: (next: string[]) => void;
  onSelectObject: (obj: any) => Promise<void> | void;
  focusObjectsInView: (options: {
    uuids: string[];
    focusUuid?: string | null;
    highlightColors?: Record<string, string>;
    updateSelection?: boolean;
  }) => boolean;
  t: (key: string) => string;
  setToast: (payload: { message: string; type: "info" | "success" | "error" }) => void;
}

type SearchCandidate = {
  uuid: string;
  name: string;
  type: string;
  modelId: string;
  sourceLabel: string;
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

function normalizeDisplayName(value: unknown) {
  return String(value ?? "").trim();
}

function readRowValue(doc: any, keys: string[]) {
  if (!doc || !Array.isArray(doc.rows)) return "";
  const keySet = new Set(keys.map((key) => normalizePropertyToken(key)));
  const row = doc.rows.find((item: any) => {
    const key = normalizePropertyToken(item?.key || "");
    const path = normalizePropertyToken(item?.path || "");
    const rawKey = normalizePropertyToken(item?.rawKey || "");
    return keySet.has(key) || keySet.has(path) || keySet.has(rawKey);
  });
  return normalizeDisplayName(row?.value);
}

function getFriendlyObjectName(sceneMgr: SceneManager, uuid: string, obj: THREE.Object3D | null, fallback = "") {
  const doc = (sceneMgr as any).getNbimPropertySearchDocument?.(uuid);
  const expressId = normalizeDisplayName(
    readRowValue(doc, ["IFC 标识.ExpressID", "IFC.ExpressID", "ExpressID"])
    || obj?.userData?.expressID
  );
  const bimId = normalizeDisplayName((sceneMgr as any).getBimIdByUuid?.(uuid) || doc?.bimId || obj?.userData?.bimId);
  const ifcType = normalizeDisplayName(
    readRowValue(doc, ["IFC 标识.类型", "IFC.类型", "IFC Type", "ifcType"])
    || obj?.userData?.ifcType
    || obj?.type
  );
  const name = normalizeDisplayName(
    readRowValue(doc, ["基本信息.名称", "Object.name", "Name", "名称"])
    || obj?.name
    || doc?.name
    || fallback
  );

  if (bimId && bimId !== uuid) return bimId;
  if (expressId) return `${ifcType && ifcType !== "Mesh" ? ifcType : "IFC"} #${expressId}`;
  if (name && name !== "Mesh" && name !== uuid) return name;
  return fallback || uuid;
}

export function usePropertySearch({
  sceneMgrRef,
  selectedUuids,
  setSelectedUuids,
  onSelectObject,
  focusObjectsInView,
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
  const [propertyFieldOptions, setPropertyFieldOptions] = useState<PropertyFieldOption[]>([]);
  const propertyIndexVersionRef = useRef(-1);
  const searchRunTokenRef = useRef(0);
  const searchInFlightRef = useRef(false);


  const syncPropertyFieldOptions = useCallback(() => {
    const manager = sceneMgrRef.current as any;
    if (!manager?.getNbimPropertyNameIndex) {
      setPropertyFieldOptions([]);
      return;
    }

    const version = typeof manager.getNbimPropertyNameIndexVersion === "function"
      ? manager.getNbimPropertyNameIndexVersion()
      : Date.now();

    if (propertyIndexVersionRef.current === version) return;
    propertyIndexVersionRef.current = version;

    const index = manager.getNbimPropertyNameIndex() || [];
    setPropertyFieldOptions(
      index.map((item: any) => ({
        value: String(item.path || ""),
        label: String(item.path || ""),
        count: Number(item.count || 0)
      })).filter((item: PropertyFieldOption) => item.value)
    );
  }, [sceneMgrRef]);

  useEffect(() => {
    syncPropertyFieldOptions();
    const timer = window.setInterval(syncPropertyFieldOptions, 500);
    return () => window.clearInterval(timer);
  }, [syncPropertyFieldOptions]);

  const resolveModelId = useCallback((uuid: string, obj: THREE.Object3D | null) => {
    let cursor: THREE.Object3D | null = obj;
    while (cursor) {
      const owner = cursor.userData?.originalUuid || cursor.userData?.modelUuid || cursor.userData?.rootUuid;
      if (owner) return String(owner);
      cursor = cursor.parent;
    }
    const structureNode = sceneMgrRef.current?.getStructureNodes(uuid)?.[0];
    if (structureNode?.userData?.originalUuid) return String(structureNode.userData.originalUuid);
    return uuid;
  }, [sceneMgrRef]);

  const buildSearchPropertyEntries = useCallback((uuid: string, obj: THREE.Object3D) => {
    const entries: PropertyEntry[] = [];

    const searchDoc = (obj as any)?.userData?.nbimSearchDocument
      || (sceneMgrRef.current as any)?.getNbimPropertySearchDocument?.(uuid);

    if (searchDoc && Array.isArray(searchDoc.rows)) {
      searchDoc.rows.forEach((row: any, index: number) => {
        appendPropertyEntries(entries, row.group || "NBIM", [{
          key: row.key,
          value: row.value,
          rawKey: row.rawKey,
          id: `${searchDoc.uuid || uuid}::${row.path || row.key}::${index}`,
          source: row.source || "property-index"
        }], row.source || "property-index");
      });
    }

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

    if (!searchDoc) {
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
    }

    return entries;
  }, [sceneMgrRef]);

  // 收集搜索候选：有几何体的 mesh 优先，按语义 ID 去重，排除纯结构容器（无外形节点）
  const collectSearchCandidates = useCallback(() => {
    const candidates: SearchCandidate[] = [];
    const sceneMgr = sceneMgrRef.current;
    if (!sceneMgr) return candidates;

    // 有几何体的 mesh uuid 集合。只在本次搜索中构建一次，避免对每个属性文档反复调用 collectRenderableTargets。
    const meshUuids = new Set<string>();
    // 可渲染对象的语义键集合：uuid / bimId / expressID。用于过滤无外形属性文档。
    const renderableSemanticKeys = new Set<string>();
    // 语义去重键（bimId / expressID / uuid）
    const semanticVisited = new Set<string>();

    sceneMgr.contentGroup.updateMatrixWorld(true);
    sceneMgr.contentGroup.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (mesh.userData?.isIfcGridHelper) return;
      meshUuids.add(mesh.uuid);

      const meshBimId = sceneMgr.getBimIdByUuid(mesh.uuid);
      const meshExpressId = mesh.userData?.expressID;
      renderableSemanticKeys.add(mesh.uuid);
      if (meshBimId) renderableSemanticKeys.add(String(meshBimId));
      if (meshExpressId !== undefined && meshExpressId !== null) renderableSemanticKeys.add(String(meshExpressId));

      const semanticKey = String(
        meshBimId
        || meshExpressId
        || mesh.uuid
      );
      if (semanticVisited.has(semanticKey)) return;
      semanticVisited.add(semanticKey);

      candidates.push({
        uuid: mesh.uuid,
        name: getFriendlyObjectName(sceneMgr, mesh.uuid, mesh, mesh.name || mesh.uuid),
        type: mesh.type || "Mesh",
        modelId: resolveModelId(mesh.uuid, mesh),
        sourceLabel: "object",
        source: mesh
      });
    });

    // 结构节点补充：只加入有对应真实 mesh 且未被去重覆盖的节点
    const walkNodes = (nodes: any[]) => {
      nodes.forEach((node) => {
        if (!node || node.visible === false) return;
        const id = String(node.id || "");
        if (id && node.bimId) {
          const semanticKey = String(node.bimId || id);
          if (!semanticVisited.has(semanticKey) && meshUuids.has(id)) {
            renderableSemanticKeys.add(id);
            renderableSemanticKeys.add(String(node.bimId));
            semanticVisited.add(semanticKey);
            candidates.push({
              uuid: id,
              name: getFriendlyObjectName(sceneMgr, id, null, String(node.name || id)),
              type: String(node.type || "Node"),
              modelId: String(node.userData?.originalUuid || id),
              sourceLabel: "structure",
              source: {
                name: node.name,
                type: node.type,
                userData: node.userData || {}
              } as THREE.Object3D
            });
          }
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          walkNodes(node.children);
        }
      });
    };

    if (Array.isArray(sceneMgr.structureRoot?.children) && sceneMgr.structureRoot.children.length > 0) {
      walkNodes(sceneMgr.structureRoot.children as any[]);
    }

    const nbimDocs = (sceneMgr as any).getAllNbimPropertySearchDocuments?.() || [];
    nbimDocs.forEach((doc: any) => {
      if (!doc?.uuid) return;

      const docUuid = String(doc.uuid || "");
      const docBimId = String(doc.bimId || "");
      const docExpressId = String(readRowValue(doc, ["IFC 标识.ExpressID", "IFC.ExpressID", "ExpressID"]) || "");

      // 不能在这里逐条调用 sceneMgr.hasRenderableTarget(doc.uuid)，大模型下会变成 O(n²) 并导致点击搜索卡死。
      // 只用本次遍历得到的 meshUuids / renderableSemanticKeys 做 O(1) 判断。
      const hasRenderable = meshUuids.has(docUuid)
        || (!!docBimId && renderableSemanticKeys.has(docBimId))
        || (!!docExpressId && renderableSemanticKeys.has(docExpressId));
      if (!hasRenderable) return;

      const semanticKey = String(doc.bimId || doc.uuid);
      if (semanticVisited.has(semanticKey)) return;
      semanticVisited.add(semanticKey);
      const displayName = getFriendlyObjectName(sceneMgr, docUuid, null, String(doc.name || doc.bimId || doc.uuid));
      candidates.push({
        uuid: docUuid,
        name: displayName,
        type: "PropertyIndex",
        modelId: String(doc.owner || doc.uuid),
        sourceLabel: "property-index",
        source: {
          name: displayName,
          type: "PropertyIndex",
          userData: { nbimSearchDocument: doc, originalUuid: doc.owner, bimId: doc.bimId }
        } as THREE.Object3D
      });
    });

    return candidates;
  }, [resolveModelId, sceneMgrRef]);

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
    syncPropertyFieldOptions();

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
      setToast({ message: t("search_invalid_condition"), type: "info" });
      sceneMgrRef.current.highlightObjects(selectedUuids);
      return;
    }

    const runToken = ++searchRunTokenRef.current;
    const searchStartAt = performance.now();
    searchInFlightRef.current = true;
    setSearching(true);
    setSearchProgress(0);
    setSearchStatus(t("searching"));

    try {
      // 先让 React 渲染“搜索中”遮罩，再进入候选收集，避免用户感觉点击后无响应。
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const candidates = collectSearchCandidates();
      const total = candidates.length;
      const batchSize = 120;
      const nextResults: PropertySearchResultItem[] = [];
      const resultUuidSet = new Set<string>();
      let lastProgressAt = performance.now();
      let lastYieldAt = performance.now();
      let cancelled = false;

      for (let i = 0; i < candidates.length; i++) {
        if (searchRunTokenRef.current !== runToken) {
          cancelled = true;
          setSearchStatus(t("search_cancelled"));
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

        if (result && !resultUuidSet.has(item.uuid)) {
          resultUuidSet.add(item.uuid);
          nextResults.push({
            uuid: item.uuid,
            name: item.name || item.uuid,
            type: item.type,
            modelId: item.modelId,
            source: item.sourceLabel,
            matchedBy: Array.from(matchedBy)
          });
        }

        if ((i + 1) % batchSize === 0 || i === candidates.length - 1) {
          const now = performance.now();
          const progress = total > 0 ? ((i + 1) / total) * 100 : 100;
          if (now - lastProgressAt > 80 || i === candidates.length - 1) {
            setSearchProgress(progress);
            lastProgressAt = now;
          }
          if (now - lastYieldAt > 16 || i === candidates.length - 1) {
            lastYieldAt = now;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          }
        }
      }

      if (!cancelled) {
        setSearchResults(nextResults);
        setSearchProgress(100);
        setSearchStatus(`${t("search_results")}: ${nextResults.length}`);
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
  }, [buildSearchPropertyEntries, collectSearchCandidates, evaluateCondition, matchesPropertyName, sceneMgrRef, searchConditions, selectedUuids, setToast, syncPropertyFieldOptions, t]);

  const handleApplySearchResultHighlight = useCallback((uuid: string) => {
    if (!sceneMgrRef.current) return;
    const target = sceneMgrRef.current.contentGroup.getObjectByProperty("uuid", uuid);
    focusObjectsInView({ uuids: [uuid], focusUuid: uuid });
    if (target) {
      void onSelectObject(target);
      return;
    }
    setSelectedUuids([uuid]);
  }, [focusObjectsInView, onSelectObject, sceneMgrRef, setSelectedUuids]);

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
    setSearchStatus(t("search_cancelling"));
  }, [t]);

  return {
    searchConditions,
    setSearchConditions,
    searchResults,
    searching,
    searchProgress,
    searchStatus,
    propertyFieldOptions,
    handleRunPropertySearch,
    handleApplySearchResultHighlight,
    handleClearSearchResult,
    handleCancelSearch
  };
}
