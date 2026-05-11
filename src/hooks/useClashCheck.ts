import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { SceneManager } from "../utils/scene-manager/SceneManager";

export type ClashResultItem = {
  id: string;
  pairKey: string;
  groupKey: string;
  ruleId: string;
  aUuid: string;
  bUuid: string;
  aName: string;
  bName: string;
  overlapVolume: number;
  distance: number;
  severity: "high" | "medium" | "low";
  type: "hard" | "clearance";
  status: "new" | "confirmed" | "resolved";
};

export type ClashFilter = "ALL" | "NEW" | "CONFIRMED" | "RESOLVED";
export type ClashTypeFilter = "ALL" | "HARD" | "CLEARANCE";

type ClashMeshInfo = {
  uuid: string;
  geometry: THREE.BufferGeometry;
  matrixWorld: THREE.Matrix4;
  triangleCount: number;
};

type ClashCandidate = {
  key: string;
  uuid: string;
  name: string;
  modelId: string;
  modelName: string;
  box: THREE.Box3;
  testBox: THREE.Box3;
  obb: OBB | null;
  meshInfo: ClashMeshInfo | null;
};

interface ClashModelOption {
  id: string;
  name: string;
}

interface UseClashCheckParams {
  sceneMgrRef: MutableRefObject<SceneManager | null>;
  treeRoot: any[];
  clashModelOptions: ClashModelOption[];
  selectedUuids: string[];
  setSelectedUuids: (next: string[]) => void;
  focusObjectsInView: (options: {
    uuids: string[];
    focusUuid?: string | null;
    highlightColors?: Record<string, string>;
    updateSelection?: boolean;
  }) => boolean;
  t: (key: string) => string;
}

function distanceBetweenBoxes(a: THREE.Box3, b: THREE.Box3) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function buildObbFromGeometry(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return null;
  const center = new THREE.Vector3();
  const halfSize = new THREE.Vector3();
  bb.getCenter(center);
  bb.getSize(halfSize).multiplyScalar(0.5);
  center.applyMatrix4(matrixWorld);
  const rotation = new THREE.Matrix3().setFromMatrix4(matrixWorld);
  return new OBB(center, halfSize, rotation);
}

function normalizeDisplayName(value: unknown) {
  return String(value ?? "").trim();
}

function readSearchRowValue(doc: any, keys: string[]) {
  if (!doc || !Array.isArray(doc.rows)) return "";
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const row = doc.rows.find((item: any) => {
    const key = String(item?.key || "").toLowerCase();
    const path = String(item?.path || "").toLowerCase();
    const rawKey = String(item?.rawKey || "").toLowerCase();
    return normalizedKeys.some((target) => key === target || path === target || rawKey === target || path.endsWith(`.${target}`));
  });
  return normalizeDisplayName(row?.value);
}

function getClashDisplayName(sceneMgr: SceneManager, uuid: string, obj: THREE.Object3D | null, fallback = "") {
  const doc = (sceneMgr as any).getNbimPropertySearchDocument?.(uuid);
  const expressId = normalizeDisplayName(
    readSearchRowValue(doc, ["ExpressID", "IFC 标识.ExpressID", "IFC.ExpressID"])
    || obj?.userData?.expressID
  );
  const bimId = normalizeDisplayName((sceneMgr as any).getBimIdByUuid?.(uuid) || doc?.bimId || obj?.userData?.bimId);
  const ifcType = normalizeDisplayName(
    readSearchRowValue(doc, ["类型", "IFC 标识.类型", "ifcType"])
    || obj?.userData?.ifcType
    || obj?.type
  );
  const name = normalizeDisplayName(
    readSearchRowValue(doc, ["名称", "Name"])
    || obj?.name
    || doc?.name
    || fallback
  );

  if (bimId && bimId !== uuid) return bimId;
  if (expressId) return `${ifcType && ifcType !== "Mesh" ? ifcType : "IFC"} #${expressId}`;
  if (name && name !== "Mesh" && name !== uuid) return name;
  return fallback || uuid;
}

export function useClashCheck({
  sceneMgrRef,
  treeRoot,
  clashModelOptions,
  selectedUuids,
  setSelectedUuids,
  focusObjectsInView,
  t
}: UseClashCheckParams) {
  const [clashResults, setClashResults] = useState<ClashResultItem[]>([]);
  const [clashRunning, setClashRunning] = useState(false);
  const [clashProgress, setClashProgress] = useState(0);
  const [clashStatus, setClashStatus] = useState("");
  const [clashScannedCount, setClashScannedCount] = useState(0);
  const [clashSetA, setClashSetA] = useState<string[]>([]);
  const [clashSetB, setClashSetB] = useState<string[]>([]);
  const [clashTolerance, setClashTolerance] = useState(0);
  const [clashMinOverlapVolume, setClashMinOverlapVolume] = useState(0);
  const [clashClearanceDistance, setClashClearanceDistance] = useState(0.05);
  const [clashUseNarrowPhase, setClashUseNarrowPhase] = useState(true);
  const [clashUseTrianglePhase, setClashUseTrianglePhase] = useState(false);
  const [clashIncludeSameModel, setClashIncludeSameModel] = useState(true);
  const [clashPairsScanned, setClashPairsScanned] = useState(0);
  const [clashResultFilter, setClashResultFilter] = useState<ClashFilter>("ALL");
  const [clashTypeFilter, setClashTypeFilter] = useState<ClashTypeFilter>("ALL");
  const clashRunTokenRef = useRef(0);
  const clashInFlightRef = useRef(false);
  const clashCandidateCacheRef = useRef<Map<string, ClashCandidate>>(new Map());

  const clashModelNameById = useMemo(() => {
    const map = new Map<string, string>();
    clashModelOptions.forEach((option) => map.set(option.id, option.name));
    return map;
  }, [clashModelOptions]);

  const resolveModelOwner = useCallback((obj: THREE.Object3D | null) => {
    let current: THREE.Object3D | null = obj;
    while (current) {
      const owner = current.userData?.originalUuid;
      if (owner) return String(owner);
      current = current.parent;
    }
    return "";
  }, []);

  const buildMeshInfo = useCallback((uuid: string, geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): ClashMeshInfo | null => {
    const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return null;
    const index = geometry.index;
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    return {
      uuid,
      geometry,
      matrixWorld: matrixWorld.clone(),
      triangleCount
    };
  }, []);

  const collectClashCandidates = useCallback(() => {
    const sceneMgr = sceneMgrRef.current;
    if (!sceneMgr) return [] as ClashCandidate[];

    const cached = clashCandidateCacheRef.current;
    cached.clear();

    sceneMgr.collectRenderableTargets().forEach((target) => {
      // collectRenderableTargets 已经只返回可渲染目标。
      // 不能再用 mesh.uuid 过滤 target.uuid：NBIM/合批/结构映射时 target.uuid 可能是语义节点 id，
      // 不是实际 Mesh 的 uuid，否则会把全部候选过滤掉，导致碰撞检查显示“候选 0”。
      if (target.box.isEmpty()) return;

      const nodes = sceneMgr.getStructureNodes(target.uuid) || [];
      if (nodes.length > 0 && nodes.every((node) => node.visible === false)) return;
      const modelId = nodes[0]?.userData?.originalUuid
        ? String(nodes[0].userData.originalUuid)
        : resolveModelOwner(target.object);
      const candidate: ClashCandidate = {
        key: target.key,
        uuid: target.uuid,
        name: getClashDisplayName(sceneMgr, target.uuid, target.object, target.name || target.uuid),
        modelId,
        modelName: clashModelNameById.get(modelId) || modelId || target.name || target.uuid,
        box: target.box.clone(),
        testBox: target.box.clone(),
        obb: clashUseNarrowPhase ? buildObbFromGeometry(target.geometry, target.matrixWorld) : null,
        meshInfo: buildMeshInfo(target.key, target.geometry, target.matrixWorld)
      };
      cached.set(candidate.key, candidate);
    });

    return Array.from(cached.values());
  }, [buildMeshInfo, clashModelNameById, clashUseNarrowPhase, resolveModelOwner, sceneMgrRef]);

  const collectTriangleCentersInBox = useCallback((meshInfo: ClashMeshInfo, box: THREE.Box3, maxCenters: number, maxTrianglesToScan: number) => {
    const centers: THREE.Vector3[] = [];
    const pos = meshInfo.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return centers;
    const index = meshInfo.geometry.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    const scanCount = Math.min(triCount, maxTrianglesToScan);
    const stride = triCount > scanCount ? Math.max(1, Math.floor(triCount / scanCount)) : 1;

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let ti = 0; ti < triCount; ti += stride) {
      const i0 = index ? index.getX(ti * 3) : ti * 3;
      const i1 = index ? index.getX(ti * 3 + 1) : ti * 3 + 1;
      const i2 = index ? index.getX(ti * 3 + 2) : ti * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(meshInfo.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(meshInfo.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(meshInfo.matrixWorld);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (!box.containsPoint(center)) continue;
      centers.push(center.clone());
      if (centers.length >= maxCenters) break;
    }

    return centers;
  }, []);

  const isPointInsideMeshByRaycast = useCallback((point: THREE.Vector3, meshInfo: ClashMeshInfo) => {
    const pos = meshInfo.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return false;
    const index = meshInfo.geometry.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    const maxTrianglesToScan = 12000;
    const scanCount = Math.min(triCount, maxTrianglesToScan);
    const stride = triCount > scanCount ? Math.max(1, Math.floor(triCount / scanCount)) : 1;

    const origin = point.clone();
    origin.x -= 1e-4;
    const ray = new THREE.Ray(origin, new THREE.Vector3(1, 0, 0));
    const hit = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let intersections = 0;

    for (let ti = 0; ti < triCount; ti += stride) {
      const i0 = index ? index.getX(ti * 3) : ti * 3;
      const i1 = index ? index.getX(ti * 3 + 1) : ti * 3 + 1;
      const i2 = index ? index.getX(ti * 3 + 2) : ti * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(meshInfo.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(meshInfo.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(meshInfo.matrixWorld);
      const intersection = ray.intersectTriangle(a, b, c, false, hit);
      if (!intersection || hit.x < origin.x) continue;
      intersections++;
    }

    return intersections % 2 === 1;
  }, []);

  const passesTrianglePhase = useCallback((a: ClashCandidate, b: ClashCandidate, overlap: THREE.Box3) => {
    if (!a.meshInfo || !b.meshInfo) return true;
    if (a.meshInfo.triangleCount <= 0 || b.meshInfo.triangleCount <= 0) return true;

    const triLimit = 30000;
    if (a.meshInfo.triangleCount > triLimit || b.meshInfo.triangleCount > triLimit) return true;

    const centersA = collectTriangleCentersInBox(a.meshInfo, overlap, 4, 6000);
    const centersB = collectTriangleCentersInBox(b.meshInfo, overlap, 4, 6000);
    if (centersA.length === 0 || centersB.length === 0) return false;

    return centersA.some((center) => isPointInsideMeshByRaycast(center, b.meshInfo!))
      || centersB.some((center) => isPointInsideMeshByRaycast(center, a.meshInfo!));
  }, [collectTriangleCentersInBox, isPointInsideMeshByRaycast]);

  const handleRunClashCheck = useCallback(async () => {
    if (!sceneMgrRef.current || clashInFlightRef.current) return;
    const runToken = ++clashRunTokenRef.current;
    const startedAt = performance.now();
    clashInFlightRef.current = true;
    setClashRunning(true);
    setClashProgress(0);
    setClashStatus(t("clash_collecting"));
    setClashResults([]);
    setClashPairsScanned(0);

    try {
      const rawCandidates = collectClashCandidates();
      setClashScannedCount(rawCandidates.length);
      if (rawCandidates.length < 2) {
        setClashStatus(t("clash_insufficient_candidates"));
        return;
      }

      const setAFilter = new Set(clashSetA);
      const setBFilter = new Set(clashSetB);
      const hasA = setAFilter.size > 0;
      const hasB = setBFilter.size > 0;
      const pairAllowed = (aModelId: string, bModelId: string) => {
        if (!clashIncludeSameModel && aModelId && bModelId && aModelId === bModelId) return false;
        if (hasA && hasB) {
          return (setAFilter.has(aModelId) && setBFilter.has(bModelId))
            || (setAFilter.has(bModelId) && setBFilter.has(aModelId));
        }
        if (hasA) return setAFilter.has(aModelId) || setAFilter.has(bModelId);
        if (hasB) return setBFilter.has(aModelId) || setBFilter.has(bModelId);
        return true;
      };
      const candidateEligible = (modelId: string) => {
        if (hasA && hasB) return setAFilter.has(modelId) || setBFilter.has(modelId);
        if (hasA) return setAFilter.has(modelId);
        if (hasB) return setBFilter.has(modelId);
        return true;
      };

      const effectiveClearance = Math.max(0, clashClearanceDistance);

      const bounded = rawCandidates
        .filter((candidate) => !candidate.box.isEmpty() && candidateEligible(candidate.modelId))
        .map((candidate) => {
          const testBox = candidate.box.clone();
          if (clashTolerance > 0 || effectiveClearance > 0) {
            testBox.expandByScalar(Math.max(clashTolerance, effectiveClearance));
          }
          return {
            ...candidate,
            testBox
          };
        });

      if (bounded.length < 2) {
        setClashStatus(t("clash_no_results"));
        setClashProgress(100);
        return;
      }

      bounded.sort((a, b) => a.testBox.min.x - b.testBox.min.x);
      setClashStatus(t("clash_running"));

      const maxResults = 2000;
      const results: ClashResultItem[] = [];
      const overlapBox = new THREE.Box3();
      const overlapSize = new THREE.Vector3();
      const n = bounded.length;
      let pairChecks = 0;

      for (let i = 0; i < n; i++) {
        if (clashRunTokenRef.current !== runToken) {
          setClashStatus(t("clash_cancelled"));
          return;
        }

        const a = bounded[i];
        const aMaxX = a.testBox.max.x;
        for (let j = i + 1; j < n; j++) {
          const b = bounded[j];
          if (b.testBox.min.x > aMaxX) break;
          if (!pairAllowed(a.modelId, b.modelId)) continue;
          pairChecks++;
          if (!a.testBox.intersectsBox(b.testBox)) continue;

          if (clashUseNarrowPhase && a.obb && b.obb) {
            const obbA = a.obb.clone();
            const obbB = b.obb.clone();
            if (clashTolerance > 0) {
              obbA.halfSize.addScalar(clashTolerance);
              obbB.halfSize.addScalar(clashTolerance);
            }
            if (!obbA.intersectsOBB(obbB, Number.EPSILON * 10)) continue;
          }

          overlapBox.copy(a.box).intersect(b.box);
          const hasOverlap = !overlapBox.isEmpty();
          let overlapVolume = 0;
          if (hasOverlap) {
            overlapBox.getSize(overlapSize);
            overlapVolume = Math.max(0, overlapSize.x) * Math.max(0, overlapSize.y) * Math.max(0, overlapSize.z);
          }

          const distance = hasOverlap ? 0 : distanceBetweenBoxes(a.box, b.box);
          const isHardClash = hasOverlap && overlapVolume >= clashMinOverlapVolume;
          const isClearanceClash = !hasOverlap && effectiveClearance > 0 && distance <= effectiveClearance;

          if (!isHardClash && !isClearanceClash) continue;
          if (clashUseTrianglePhase && hasOverlap && !passesTrianglePhase(a, b, overlapBox)) continue;

          const pairKey = [a.key, b.key].sort().join("::");
          const clashType: ClashResultItem["type"] = isHardClash ? "hard" : "clearance";
          const severity: ClashResultItem["severity"] =
            clashType === "hard"
              ? (overlapVolume > Math.max(0.5, clashMinOverlapVolume * 10) ? "high" : "medium")
              : (distance <= Math.max(0.001, effectiveClearance * 0.25) ? "high" : "low");
          results.push({
            id: `clash_${clashType}_${pairKey}`,
            pairKey,
            groupKey: `${clashType}::${a.modelId || "unknown"}::${b.modelId || "unknown"}::${pairKey}`,
            ruleId: clashType === "hard" ? "hard-clash-default" : "clearance-default",
            aUuid: a.uuid,
            bUuid: b.uuid,
            aName: a.name,
            bName: b.name,
            overlapVolume,
            distance,
            severity,
            type: clashType,
            status: "new"
          });
          if (results.length >= maxResults) break;
        }

        if (results.length >= maxResults) break;
        if ((i + 1) % 50 === 0 || i === n - 1) {
          const progress = 30 + ((i + 1) / n) * 70;
          setClashProgress(progress);
          setClashPairsScanned(pairChecks);
          setClashStatus(`${t("clash_running")} ${i + 1}/${n}`);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      // 按 pairKey 去重：同一对象对只保留最严重的一条
      const dedupedByPair = new Map<string, ClashResultItem>();
      const severityScores: Record<ClashResultItem["severity"], number> = { high: 3, medium: 2, low: 1 };
      
      results.forEach((item) => {
        const existing = dedupedByPair.get(item.pairKey);
        if (!existing) {
          dedupedByPair.set(item.pairKey, item);
        } else {
          const existingScore = (existing.type === "hard" ? 1000 : 0) + severityScores[existing.severity];
          const itemScore = (item.type === "hard" ? 1000 : 0) + severityScores[item.severity];
          
          if (itemScore > existingScore) {
            dedupedByPair.set(item.pairKey, item);
          } else if (itemScore === existingScore) {
            if (item.type === "hard" && item.overlapVolume > existing.overlapVolume) {
              dedupedByPair.set(item.pairKey, item);
            } else if (item.type === "clearance" && item.distance < existing.distance) {
              dedupedByPair.set(item.pairKey, item);
            }
          }
        }
      });

      const finalOrderedResults = Array.from(dedupedByPair.values()).sort((x, y) => {
        if (x.type !== y.type) return x.type === "hard" ? -1 : 1;
        if (x.type === "hard") return y.overlapVolume - x.overlapVolume;
        return x.distance - y.distance;
      });

      setClashResults((prev) => {
        const statusMap = new Map<string, ClashResultItem["status"]>();
        prev.forEach((p) => statusMap.set(p.pairKey, p.status));
        return finalOrderedResults.map((item) => ({
          ...item,
          status: statusMap.get(item.pairKey) || "new"
        }));
      });
      setClashPairsScanned(pairChecks);
      setClashProgress(100);
      setClashStatus(`${t("clash_results")}: ${finalOrderedResults.length}`);
      if (finalOrderedResults.length === 0) {
        sceneMgrRef.current.clearLocateFocus();
      }
    } finally {
      const elapsed = performance.now() - startedAt;
      const minVisibleMs = 220;
      if (elapsed < minVisibleMs) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, minVisibleMs - elapsed));
      }
      clashInFlightRef.current = false;
      setClashRunning(false);
    }
  }, [clashClearanceDistance, clashIncludeSameModel, clashMinOverlapVolume, clashSetA, clashSetB, clashTolerance, clashUseNarrowPhase, clashUseTrianglePhase, collectClashCandidates, passesTrianglePhase, sceneMgrRef, t]);

  const handleCancelClashCheck = useCallback(() => {
    if (!clashInFlightRef.current) return;
    clashRunTokenRef.current++;
    setClashStatus(t("clash_cancelling"));
  }, [t]);

  const handleClearClashResults = useCallback(() => {
    clashRunTokenRef.current++;
    clashInFlightRef.current = false;
    setClashRunning(false);
    setClashProgress(0);
    setClashStatus("");
    setClashScannedCount(0);
    setClashPairsScanned(0);
    setClashResultFilter("ALL");
    setClashTypeFilter("ALL");
    setClashResults([]);
    sceneMgrRef.current?.clearLocateFocus();
    sceneMgrRef.current?.highlightObjects(selectedUuids);
  }, [sceneMgrRef, selectedUuids]);

  const handleFocusClashResult = useCallback((item: ClashResultItem) => {
    const uuids = [item.aUuid, item.bUuid];
    focusObjectsInView({
      uuids,
      focusUuid: item.aUuid,
      highlightColors: {
        [item.aUuid]: "#ff4d4f",
        [item.bUuid]: "#1890ff"
      }
    });
  }, [focusObjectsInView]);

  const handleUpdateClashResultStatus = useCallback((id: string, nextStatus: ClashResultItem["status"]) => {
    setClashResults((prev) => prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
  }, []);

  const handleMarkFilteredClashStatus = useCallback((nextStatus: ClashResultItem["status"]) => {
    setClashResults((prev) => prev.map((item) => {
      const matchedStatus =
        clashResultFilter === "ALL"
        || (clashResultFilter === "NEW" && item.status === "new")
        || (clashResultFilter === "CONFIRMED" && item.status === "confirmed")
        || (clashResultFilter === "RESOLVED" && item.status === "resolved");
      const matchedType =
        clashTypeFilter === "ALL"
        || (clashTypeFilter === "HARD" && item.type === "hard")
        || (clashTypeFilter === "CLEARANCE" && item.type === "clearance");
      const matched = matchedStatus && matchedType;
      return matched ? { ...item, status: nextStatus } : item;
    }));
  }, [clashResultFilter, clashTypeFilter]);

  const handleExportClashCsv = useCallback(() => {
    if (clashResults.length === 0) return;
    const escapeCsv = (value: string | number) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };

    const header = ["pairKey", "type", "severity", "ruleId", "aUuid", "aName", "bUuid", "bName", "status", "overlapVolume", "distance"];
    const lines = [header.join(",")];
    clashResults.forEach((item) => {
      lines.push([
        escapeCsv(item.pairKey),
        escapeCsv(item.type),
        escapeCsv(item.severity),
        escapeCsv(item.ruleId),
        escapeCsv(item.aUuid),
        escapeCsv(item.aName),
        escapeCsv(item.bUuid),
        escapeCsv(item.bName),
        escapeCsv(item.status),
        escapeCsv(item.overlapVolume.toFixed(6)),
        escapeCsv(item.distance.toFixed(6))
      ].join(","));
    });

    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const fileName = `clash_report_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [clashResults]);

  const resetClashState = useCallback(() => {
    clashRunTokenRef.current++;
    clashInFlightRef.current = false;
    setClashResults([]);
    setClashRunning(false);
    setClashProgress(0);
    setClashStatus("");
    setClashScannedCount(0);
    setClashPairsScanned(0);
    setClashResultFilter("ALL");
    setClashTypeFilter("ALL");
  }, []);

  const applyClashModelOptionBounds = useCallback(() => {
    const validIds = new Set(clashModelOptions.map((item) => item.id));
    setClashSetA((prev) => prev.filter((id) => validIds.has(id)));
    setClashSetB((prev) => prev.filter((id) => validIds.has(id)));
  }, [clashModelOptions]);

  return {
    clashResults,
    setClashResults,
    clashRunning,
    clashProgress,
    clashStatus,
    clashScannedCount,
    clashSetA,
    clashSetB,
    clashTolerance,
    clashMinOverlapVolume,
    clashClearanceDistance,
    clashUseNarrowPhase,
    clashUseTrianglePhase,
    clashPruning: true,
    clashIncludeSameModel,
    clashPairsScanned,
    clashResultFilter,
    clashTypeFilter,
    setClashSetA,
    setClashSetB,
    setClashTolerance,
    setClashMinOverlapVolume,
    setClashClearanceDistance,
    setClashUseNarrowPhase,
    setClashUseTrianglePhase,
    setClashIncludeSameModel,
    setClashResultFilter,
    setClashTypeFilter,
    handleRunClashCheck,
    handleCancelClashCheck,
    handleClearClashResults,
    handleFocusClashResult,
    handleUpdateClashResultStatus,
    handleMarkFilteredClashStatus,
    handleExportClashCsv,
    resetClashState,
    applyClashModelOptionBounds
  };
}
