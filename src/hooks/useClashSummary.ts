import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { SceneManager } from "../utils/scene-manager/SceneManager";
import type { ClashResultItem } from "./useClashCheck";

type ClashSummaryRecord = {
  total: number;
  newCount: number;
  confirmedCount: number;
  resolvedCount: number;
  worstStatus: "new" | "confirmed" | "resolved";
};

export function useClashSummary(sceneMgrRef: MutableRefObject<SceneManager | null>, clashResults: ClashResultItem[]) {
  const annotatedUuidsRef = useRef<Set<string>>(new Set());

  const clashSummaryByUuid = useMemo(() => {
    const summary = new Map<string, ClashSummaryRecord>();
    const merge = (uuid: string, status: "new" | "confirmed" | "resolved") => {
      if (!uuid) return;
      const current = summary.get(uuid) || {
        total: 0,
        newCount: 0,
        confirmedCount: 0,
        resolvedCount: 0,
        worstStatus: "resolved" as const
      };
      current.total += 1;
      if (status === "new") current.newCount += 1;
      else if (status === "confirmed") current.confirmedCount += 1;
      else current.resolvedCount += 1;

      if (current.newCount > 0) current.worstStatus = "new";
      else if (current.confirmedCount > 0) current.worstStatus = "confirmed";
      else current.worstStatus = "resolved";
      summary.set(uuid, current);
    };

    clashResults.forEach((item) => {
      merge(item.aUuid, item.status);
      merge(item.bUuid, item.status);
    });

    const out: Record<string, ClashSummaryRecord> = {};
    summary.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }, [clashResults]);

  useEffect(() => {
    if (!sceneMgrRef.current) return;
    const mgr = sceneMgrRef.current;
    const previouslyAnnotated = annotatedUuidsRef.current;
    previouslyAnnotated.forEach((uuid) => {
      const obj = mgr.contentGroup.getObjectByProperty("uuid", uuid) as any;
      if (obj?.userData?.clash) delete obj.userData.clash;
      const nodes = mgr.getStructureNodes(uuid) || [];
      nodes.forEach((node: any) => {
        if (node?.userData?.clash) delete node.userData.clash;
      });
    });

    const nextAnnotated = new Set<string>();
    Object.entries(clashSummaryByUuid).forEach(([uuid, stat]) => {
      nextAnnotated.add(uuid);
      const payload = {
        total: stat.total,
        new: stat.newCount,
        confirmed: stat.confirmedCount,
        resolved: stat.resolvedCount,
        status: stat.worstStatus
      };
      const obj = mgr.contentGroup.getObjectByProperty("uuid", uuid) as any;
      if (obj) {
        if (!obj.userData) obj.userData = {};
        obj.userData.clash = payload;
      }
      const nodes = mgr.getStructureNodes(uuid) || [];
      nodes.forEach((node: any) => {
        if (!node.userData) node.userData = {};
        node.userData.clash = payload;
      });
    });
    annotatedUuidsRef.current = nextAnnotated;
  }, [clashSummaryByUuid, sceneMgrRef]);

  return clashSummaryByUuid;
}

