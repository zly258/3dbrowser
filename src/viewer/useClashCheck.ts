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
  const clashMeshInfoCacheRef = useRef<Map<string, ClashMeshInfo>>(new Map());

  const collectClashCandidates = useCallback(() => {
    if (!sceneMgrRef.current) return [] as Array<{ uuid: string; name: string; modelId: string; modelName: string }>;

    const modelNameById = new Map<string, string>();
    clashModelOptions.forEach((item) => {
      modelNameById.set(item.id, item.name);
    });
    const candidates: Array<{ uuid: string; name: string; modelId: string; modelName: string }> = [];
    const visited = new Set<string>();
    const walk = (nodes: any[], owner?: { modelId: string; modelName: string }) => {
      nodes.forEach((node) => {
        if (!node || node.visible === false) return;
        const id = String(node.id || node.uuid || "");
        if (!id) return;
        const nodeModelId = String(node?.object?.userData?.originalUuid || node?.userData?.originalUuid || owner?.modelId || "");
        const nodeModelName = String(modelNameById.get(nodeModelId) || owner?.modelName || node?.name || nodeModelId || "");
        const children = Array.isArray(node.children) ? node.children : [];
        const isLeaf = children.length === 0;
        const isMeshLike = String(node.type || "").toLowerCase() === "mesh";
        if ((isMeshLike || isLeaf) && !visited.has(id)) {
          visited.add(id);
          candidates.push({
            uuid: id,
            name: String(node.name || id),
            modelId: nodeModelId,
            modelName: nodeModelName
          });
        }
        if (children.length > 0) {
          walk(children, {
            modelId: nodeModelId || owner?.modelId || "",
            modelName: nodeModelName || owner?.modelName || ""
          });
        }
      });
    };

    if (treeRoot.length > 0) {
      walk(treeRoot as any[]);
    }

    if (candidates.length === 0 && sceneMgrRef.current) {
      const resolveOwner = (obj: THREE.Object3D) => {
        let current: THREE.Object3D | null = obj;
        while (current) {
          const owner = current.userData?.originalUuid;
          if (owner) return String(owner);
          current = current.parent;
        }
        return "";
      };
      sceneMgrRef.current.contentGroup.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (visited.has(mesh.uuid)) return;
        visited.add(mesh.uuid);
        const modelId = resolveOwner(mesh);
        const modelName = String(modelNameById.get(modelId) || modelId || mesh.name || mesh.uuid);
        candidates.push({
          uuid: mesh.uuid,
          name: mesh.name || mesh.uuid,
          modelId,
          modelName
        });
      });
    }

    return candidates;
  }, [clashModelOptions, sceneMgrRef, treeRoot]);

  const getCandidateObb = useCallback((uuid: string) => {
    if (!sceneMgrRef.current) return null;
    const obj = sceneMgrRef.current.contentGroup.getObjectByProperty("uuid", uuid) as THREE.Object3D | null;
    if (!obj) return null;

    const targetMesh = (obj as THREE.Mesh).isMesh ? (obj as THREE.Mesh) : (() => {
      let found: THREE.Mesh | null = null;
      obj.traverse((child) => {
        if (found) return;
        const m = child as THREE.Mesh;
        if (m.isMesh) found = m;
      });
      return found;
    })();
    if (!targetMesh || !targetMesh.geometry) return null;

    if (!targetMesh.geometry.boundingBox) {
      targetMesh.geometry.computeBoundingBox();
    }
    const bb = targetMesh.geometry.boundingBox;
    if (!bb) return null;
    const center = new THREE.Vector3();
    const halfSize = new THREE.Vector3();
    bb.getCenter(center);
    bb.getSize(halfSize).multiplyScalar(0.5);

    center.applyMatrix4(targetMesh.matrixWorld);
    const rot = new THREE.Matrix3().setFromMatrix4(targetMesh.matrixWorld);
    const obb = new OBB(center, halfSize, rot);
    return obb;
  }, [sceneMgrRef]);

  const getClashMeshInfo = useCallback((uuid: string): ClashMeshInfo | null => {
    if (!sceneMgrRef.current) return null;
    const cached = clashMeshInfoCacheRef.current.get(uuid);
    if (cached) return cached;

    const obj = sceneMgrRef.current.contentGroup.getObjectByProperty("uuid", uuid) as THREE.Object3D | null;
    if (!obj) return null;

    const mesh = (obj as THREE.Mesh).isMesh ? (obj as THREE.Mesh) : (() => {
      let found: THREE.Mesh | null = null;
      obj.traverse((child) => {
        if (found) return;
        const m = child as THREE.Mesh;
        if (m.isMesh && m.geometry) found = m;
      });
      return found;
    })();
    if (!mesh || !mesh.geometry) return null;

    const geometry = mesh.geometry;
    const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return null;
    const index = geometry.index;
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    const info: ClashMeshInfo = { uuid, geometry, matrixWorld: mesh.matrixWorld.clone(), triangleCount };
    clashMeshInfoCacheRef.current.set(uuid, info);
    return info;
  }, [sceneMgrRef]);

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
    const dir = new THREE.Vector3(1, 0, 0);
    const ray = new THREE.Ray(origin, dir);
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
      const h = ray.intersectTriangle(a, b, c, false, hit);
      if (!h) continue;
      if (hit.x < origin.x) continue;
      intersections++;
    }

    return intersections % 2 === 1;
  }, []);

  const passesTrianglePhase = useCallback((aUuid: string, bUuid: string, overlap: THREE.Box3) => {
    const aInfo = getClashMeshInfo(aUuid);
    const bInfo = getClashMeshInfo(bUuid);
    if (!aInfo || !bInfo) return true;
    if (aInfo.triangleCount <= 0 || bInfo.triangleCount <= 0) return true;

    const triLimit = 30000;
    if (aInfo.triangleCount > triLimit || bInfo.triangleCount > triLimit) return true;

    const centersA = collectTriangleCentersInBox(aInfo, overlap, 4, 6000);
    const centersB = collectTriangleCentersInBox(bInfo, overlap, 4, 6000);
    if (centersA.length === 0 || centersB.length === 0) return false;

    const aInsideB = centersA.some((center) => isPointInsideMeshByRaycast(center, bInfo));
    if (aInsideB) return true;
    const bInsideA = centersB.some((center) => isPointInsideMeshByRaycast(center, aInfo));
    return bInsideA;
  }, [collectTriangleCentersInBox, getClashMeshInfo, isPointInsideMeshByRaycast]);

  const handleRunClashCheck = useCallback(async () => {
    if (!sceneMgrRef.current || clashInFlightRef.current) return;
    const runToken = ++clashRunTokenRef.current;
    const startedAt = performance.now();
    clashInFlightRef.current = true;
    clashMeshInfoCacheRef.current.clear();
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

      const bounded: Array<{ uuid: string; name: string; box: THREE.Box3; testBox: THREE.Box3; obb: OBB | null; modelId: string; modelName: string }> = [];
      const boundsBatch = 240;
      for (let i = 0; i < rawCandidates.length; i++) {
        if (clashRunTokenRef.current !== runToken) {
          setClashStatus(t("search_cancelled") || "搜索已取消");
          return;
        }
        const item = rawCandidates[i];
        const box = sceneMgrRef.current.getBoundsForObject(item.uuid);
        if (box && !box.isEmpty()) {
          const testBox = box.clone();
          if (clashTolerance > 0) testBox.expandByScalar(clashTolerance);
          const obb = clashUseNarrowPhase ? getCandidateObb(item.uuid) : null;
          bounded.push({ ...item, box, testBox, obb });
        }
        if ((i + 1) % boundsBatch === 0 || i === rawCandidates.length - 1) {
          const p = rawCandidates.length > 0 ? ((i + 1) / rawCandidates.length) * 30 : 30;
          setClashProgress(p);
          setClashStatus(`${t("clash_collecting") || "正在收集构件..."} ${i + 1}/${rawCandidates.length}`);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

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
      const n = bounded.length;
      let pairChecks = 0;
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

      for (let i = 0; i < n; i++) {
        if (clashRunTokenRef.current !== runToken) {
          setClashStatus(t("search_cancelled") || "搜索已取消");
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
            const overlapSize = overlapBox.getSize(new THREE.Vector3());
            overlapVolume = Math.max(0, overlapSize.x) * Math.max(0, overlapSize.y) * Math.max(0, overlapSize.z);
          }
          if (overlapVolume < clashMinOverlapVolume) continue;
          if (clashUseTrianglePhase) {
            if (overlapBox.isEmpty()) continue;
            const passed = passesTrianglePhase(a.uuid, b.uuid, overlapBox);
            if (!passed) continue;
          }
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
          const p = 30 + ((i + 1) / n) * 70;
          setClashProgress(p);
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
  }, [clashMinOverlapVolume, clashSetA, clashSetB, clashTolerance, clashUseNarrowPhase, clashUseTrianglePhase, collectClashCandidates, getCandidateObb, passesTrianglePhase, sceneMgrRef, t]);

  const handleCancelClashCheck = useCallback(() => {
    if (!clashInFlightRef.current) return;
    clashRunTokenRef.current++;
    setClashStatus(t("search_cancelling") || "正在取消搜索...");
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
    const pad = (v: number) => String(v).padStart(2, "0");
    const fileName = `clash_report_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
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
