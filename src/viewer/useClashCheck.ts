import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { SceneManager } from "../utils/SceneManager";

export type ClashResultItem = {
  id: string;
  pairKey: string;
  aUuid: string;
  bUuid: string;
  aName: string;
  bName: string;
  overlapVolume: number;
  status: "new" | "confirmed" | "resolved";
};

export type ClashFilter = "ALL" | "NEW" | "CONFIRMED" | "RESOLVED";

type ClashMeshInfo = {
  uuid: string;
  geometry: THREE.BufferGeometry;
  matrixWorld: THREE.Matrix4;
  triangleCount: number;
};

type ClashCandidate = {
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
  t: (key: string) => string;
}

function buildBoxFromGeometry(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox ? geometry.boundingBox.clone().applyMatrix4(matrixWorld) : null;
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

export function useClashCheck({
  sceneMgrRef,
  treeRoot,
  clashModelOptions,
  selectedUuids,
  setSelectedUuids,
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
  const [clashUseNarrowPhase, setClashUseNarrowPhase] = useState(true);
  const [clashUseTrianglePhase, setClashUseTrianglePhase] = useState(false);
  const [clashPairsScanned, setClashPairsScanned] = useState(0);
  const [clashResultFilter, setClashResultFilter] = useState<ClashFilter>("ALL");
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
    sceneMgr.contentGroup.updateMatrixWorld(true);

    sceneMgr.contentGroup.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      if (mesh.userData?.isIfcGridHelper) return;

      const box = buildBoxFromGeometry(mesh.geometry, mesh.matrixWorld);
      if (!box || box.isEmpty()) return;
      const modelId = resolveModelOwner(mesh);
      const candidate: ClashCandidate = {
        uuid: mesh.uuid,
        name: mesh.name || mesh.uuid,
        modelId,
        modelName: clashModelNameById.get(modelId) || modelId || mesh.name || mesh.uuid,
        box,
        testBox: box.clone(),
        obb: clashUseNarrowPhase ? buildObbFromGeometry(mesh.geometry, mesh.matrixWorld) : null,
        meshInfo: buildMeshInfo(mesh.uuid, mesh.geometry, mesh.matrixWorld)
      };
      cached.set(candidate.uuid, candidate);
    });

    sceneMgr.optimizedMapping.forEach((mappings, originalUuid) => {
      if (cached.has(originalUuid) || !mappings || mappings.length === 0) return;
      const nodes = sceneMgr.getStructureNodes(originalUuid) || [];
      if (nodes.length > 0 && nodes.every((node) => node.visible === false)) return;

      const box = new THREE.Box3();
      mappings.forEach((mapping) => {
        const geometry = mapping.geometry || mapping.mesh.geometry;
        if (!geometry) return;
        const matrix = new THREE.Matrix4();
        mapping.mesh.getMatrixAt(mapping.instanceId, matrix);
        matrix.premultiply(mapping.mesh.matrixWorld);
        const partBox = buildBoxFromGeometry(geometry, matrix);
        if (partBox && !partBox.isEmpty()) box.union(partBox);
      });
      if (box.isEmpty()) return;

      const node = nodes[0];
      const modelId = node?.userData?.originalUuid ? String(node.userData.originalUuid) : "";
      cached.set(originalUuid, {
        uuid: originalUuid,
        name: node?.name || originalUuid,
        modelId,
        modelName: clashModelNameById.get(modelId) || modelId || node?.name || originalUuid,
        box,
        testBox: box.clone(),
        obb: null,
        meshInfo: null
      });
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
    setClashStatus(t("clash_collecting") || "正在收集构件...");
    setClashResults([]);
    setClashPairsScanned(0);

    try {
      const rawCandidates = collectClashCandidates();
      setClashScannedCount(rawCandidates.length);
      if (rawCandidates.length < 2) {
        setClashStatus(t("clash_insufficient_candidates") || "可检测构件不足（至少需要2个）");
        return;
      }

      const setAFilter = new Set(clashSetA);
      const setBFilter = new Set(clashSetB);
      const hasA = setAFilter.size > 0;
      const hasB = setBFilter.size > 0;
      const pairAllowed = (aModelId: string, bModelId: string) => {
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

      const bounded = rawCandidates
        .filter((candidate) => !candidate.box.isEmpty() && candidateEligible(candidate.modelId))
        .map((candidate) => {
          const testBox = candidate.box.clone();
          if (clashTolerance > 0) testBox.expandByScalar(clashTolerance);
          return {
            ...candidate,
            testBox
          };
        });

      if (bounded.length < 2) {
        setClashStatus(t("clash_no_results") || "暂无碰撞结果");
        setClashProgress(100);
        return;
      }

      bounded.sort((a, b) => a.testBox.min.x - b.testBox.min.x);
      setClashStatus(t("clash_running") || "正在执行碰撞检查...");

      const maxResults = 2000;
      const results: ClashResultItem[] = [];
      const overlapBox = new THREE.Box3();
      const overlapSize = new THREE.Vector3();
      const n = bounded.length;
      let pairChecks = 0;

      for (let i = 0; i < n; i++) {
        if (clashRunTokenRef.current !== runToken) {
          setClashStatus(t("clash_cancelled") || "碰撞检查已取消");
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
          let overlapVolume = 0;
          if (!overlapBox.isEmpty()) {
            overlapBox.getSize(overlapSize);
            overlapVolume = Math.max(0, overlapSize.x) * Math.max(0, overlapSize.y) * Math.max(0, overlapSize.z);
          }
          if (overlapVolume < clashMinOverlapVolume) continue;
          if (clashUseTrianglePhase && (!overlapBox.isEmpty()) && !passesTrianglePhase(a, b, overlapBox)) continue;

          const pairKey = [a.uuid, b.uuid].sort().join("::");
          results.push({
            id: `clash_${pairKey}_${results.length}`,
            pairKey,
            aUuid: a.uuid,
            bUuid: b.uuid,
            aName: a.name,
            bName: b.name,
            overlapVolume,
            status: "new"
          });
          if (results.length >= maxResults) break;
        }

        if (results.length >= maxResults) break;
        if ((i + 1) % 50 === 0 || i === n - 1) {
          const progress = 30 + ((i + 1) / n) * 70;
          setClashProgress(progress);
          setClashPairsScanned(pairChecks);
          setClashStatus(`${t("clash_running") || "正在执行碰撞检查..."} ${i + 1}/${n}`);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      results.sort((x, y) => y.overlapVolume - x.overlapVolume);
      setClashResults((prev) => {
        const statusByPair = new Map<string, ClashResultItem["status"]>();
        prev.forEach((item) => statusByPair.set(item.pairKey, item.status));
        return results.map((item) => ({
          ...item,
          status: statusByPair.get(item.pairKey) || "new"
        }));
      });
      setClashPairsScanned(pairChecks);
      setClashProgress(100);
      setClashStatus(`${t("clash_results") || "碰撞结果"}: ${results.length}`);
      if (results.length === 0) {
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
  }, [clashMinOverlapVolume, clashSetA, clashSetB, clashTolerance, clashUseNarrowPhase, clashUseTrianglePhase, collectClashCandidates, passesTrianglePhase, sceneMgrRef, t]);

  const handleCancelClashCheck = useCallback(() => {
    if (!clashInFlightRef.current) return;
    clashRunTokenRef.current++;
    setClashStatus(t("clash_cancelling") || "正在取消碰撞检查...");
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
    setClashResults([]);
    sceneMgrRef.current?.clearLocateFocus();
    sceneMgrRef.current?.highlightObjects(selectedUuids);
  }, [sceneMgrRef, selectedUuids]);

  const handleFocusClashResult = useCallback((item: ClashResultItem) => {
    if (!sceneMgrRef.current) return;
    const uuids = [item.aUuid, item.bUuid];
    sceneMgrRef.current.setClashPairHighlight(item.aUuid, item.bUuid);
    sceneMgrRef.current.fitViewToObjects(uuids);
    setSelectedUuids(uuids);
  }, [sceneMgrRef, setSelectedUuids]);

  const handleUpdateClashResultStatus = useCallback((id: string, nextStatus: ClashResultItem["status"]) => {
    setClashResults((prev) => prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
  }, []);

  const handleMarkFilteredClashStatus = useCallback((nextStatus: ClashResultItem["status"]) => {
    setClashResults((prev) => prev.map((item) => {
      const matched =
        clashResultFilter === "ALL"
        || (clashResultFilter === "NEW" && item.status === "new")
        || (clashResultFilter === "CONFIRMED" && item.status === "confirmed")
        || (clashResultFilter === "RESOLVED" && item.status === "resolved");
      return matched ? { ...item, status: nextStatus } : item;
    }));
  }, [clashResultFilter]);

  const handleExportClashCsv = useCallback(() => {
    if (clashResults.length === 0) return;
    const escapeCsv = (value: string | number) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };

    const header = ["pairKey", "aUuid", "aName", "bUuid", "bName", "status", "overlapVolume"];
    const lines = [header.join(",")];
    clashResults.forEach((item) => {
      lines.push([
        escapeCsv(item.pairKey),
        escapeCsv(item.aUuid),
        escapeCsv(item.aName),
        escapeCsv(item.bUuid),
        escapeCsv(item.bName),
        escapeCsv(item.status),
        escapeCsv(item.overlapVolume.toFixed(6))
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
    clashUseNarrowPhase,
    clashUseTrianglePhase,
    clashPairsScanned,
    clashResultFilter,
    setClashSetA,
    setClashSetB,
    setClashTolerance,
    setClashMinOverlapVolume,
    setClashUseNarrowPhase,
    setClashUseTrianglePhase,
    setClashResultFilter,
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
