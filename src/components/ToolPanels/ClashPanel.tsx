import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, Checkbox, Select } from "../common";
import { IconChevronLeft, IconChevronRight } from "../../theme/Icons";

export interface ClashResultItem {
  id: string;
  aUuid: string;
  bUuid: string;
  aName: string;
  bName: string;
  overlapVolume: number;
}

interface ClashPanelProps {
  t: (key: string) => string;
  onClose: () => void;
  running: boolean;
  progress: number;
  status: string;
  scannedCount: number;
  pairsScanned: number;
  results: ClashResultItem[];
  modelOptions: Array<{ id: string; name: string }>;
  setA: string[];
  setB: string[];
  tolerance: number;
  minOverlapVolume: number;
  useNarrowPhase: boolean;
  useTrianglePhase: boolean;
  onSetAChange: (next: string[]) => void;
  onSetBChange: (next: string[]) => void;
  onToleranceChange: (next: number) => void;
  onMinOverlapVolumeChange: (next: number) => void;
  onUseNarrowPhaseChange: (next: boolean) => void;
  onUseTrianglePhaseChange: (next: boolean) => void;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  onSetASelectAll: () => void;
  onSetAClear: () => void;
  onSetBSelectAll: () => void;
  onSetBClear: () => void;
  onFocusResult: (item: ClashResultItem) => void;
  theme?: any;
}

export const ClashPanel: React.FC<ClashPanelProps> = ({
  t,
  onClose,
  running,
  progress,
  status,
  scannedCount,
  pairsScanned,
  results,
  modelOptions,
  setA,
  setB,
  tolerance,
  minOverlapVolume,
  useNarrowPhase,
  useTrianglePhase,
  onSetAChange,
  onSetBChange,
  onToleranceChange,
  onMinOverlapVolumeChange,
  onUseNarrowPhaseChange,
  onUseTrianglePhaseChange,
  onRun,
  onCancel,
  onClear,
  onSetASelectAll,
  onSetAClear,
  onSetBSelectAll,
  onSetBClear,
  onFocusResult,
  theme
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setPage(1);
  }, [results.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => results.slice(pageStart, pageStart + pageSize), [results, pageStart, pageSize]);
  const setAIds = useMemo(() => new Set(setA), [setA]);
  const setBIds = useMemo(() => new Set(setB), [setB]);

  const toggleFromSet = (source: string[], id: string, onChange: (next: string[]) => void) => {
    const nextSet = new Set(source);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    onChange(Array.from(nextSet));
  };

  return (
    <FloatingPanel
      title={t("tb_clash") || "碰撞检查"}
      onClose={onClose}
      width={500}
      storageId="tool_clash"
      autoHeight={true}
      theme={theme}
    >
      <div style={{ position: "relative", padding: "12px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "68vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {t("clash_scope_visible") || "范围：当前可见构件"} | {t("clash_candidates") || "候选"}: {scannedCount}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!running ? (
              <Button className="ui-properties-action" onClick={onRun}>
                {t("clash_run") || "开始检查"}
              </Button>
            ) : (
              <Button className="ui-properties-action" onClick={onCancel}>
                {t("search_cancel") || "取消搜索"}
              </Button>
            )}
            <Button className="ui-properties-action" onClick={onClear}>
              {t("clash_clear") || "清空结果"}
            </Button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ border: "1px solid var(--border-color)", borderRadius: 6, padding: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12 }}>{t("clash_set_a") || "模型集 A"}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetASelectAll}>{t("select_all") || "全选"}</button>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetAClear}>{t("search_clear") || "清空"}</button>
              </div>
            </div>
            <div style={{ maxHeight: 92, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {modelOptions.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("clash_no_models") || "暂无模型"}</div>
              ) : (
                modelOptions.map((item) => (
                  <Checkbox
                    key={`a_${item.id}`}
                    checked={setAIds.has(item.id)}
                    onChange={() => toggleFromSet(setA, item.id, onSetAChange)}
                    label={item.name}
                    labelStyle={{ fontSize: 11 }}
                  />
                ))
              )}
            </div>
          </div>
          <div style={{ border: "1px solid var(--border-color)", borderRadius: 6, padding: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12 }}>{t("clash_set_b") || "模型集 B"}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBSelectAll}>{t("select_all") || "全选"}</button>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBClear}>{t("search_clear") || "清空"}</button>
              </div>
            </div>
            <div style={{ maxHeight: 92, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {modelOptions.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("clash_no_models") || "暂无模型"}</div>
              ) : (
                modelOptions.map((item) => (
                  <Checkbox
                    key={`b_${item.id}`}
                    checked={setBIds.has(item.id)}
                    onChange={() => toggleFromSet(setB, item.id, onSetBChange)}
                    label={item.name}
                    labelStyle={{ fontSize: 11 }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{t("clash_tolerance") || "容差"}</div>
            <input
              className="ui-input ui-input-compact"
              type="number"
              value={Number.isFinite(tolerance) ? tolerance : 0}
              min={0}
              step={0.001}
              onChange={(e) => onToleranceChange(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{t("clash_min_overlap") || "最小重叠体积"}</div>
            <input
              className="ui-input ui-input-compact"
              type="number"
              value={Number.isFinite(minOverlapVolume) ? minOverlapVolume : 0}
              min={0}
              step={0.000001}
              onChange={(e) => onMinOverlapVolumeChange(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Checkbox
            checked={useNarrowPhase}
            onChange={onUseNarrowPhaseChange}
            label={t("clash_narrow_phase") || "启用精筛（OBB）"}
            labelStyle={{ fontSize: 12 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Checkbox
            checked={useTrianglePhase}
            onChange={onUseTrianglePhaseChange}
            label={t("clash_triangle_phase") || "启用三角面复核"}
            labelStyle={{ fontSize: 12 }}
          />
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {status || (running ? (t("clash_running") || "正在执行碰撞检查...") : (t("clash_ready") || "准备就绪"))}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {(t("clash_pairs_scanned") || "已扫描对数")}: {pairsScanned}
        </div>
        <div className="ui-progress-bar" style={{ width: "100%" }}>
          <div className="ui-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t("clash_results") || "碰撞结果"}: {results.length}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>{t("search_page_size") || "每页"}</span>
            <Select
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value) || 50)}
              options={[
                { value: "20", label: "20" },
                { value: "50", label: "50" },
                { value: "100", label: "100" }
              ]}
              className="ui-input-compact"
              style={{ minWidth: 68 }}
            />
          </div>
        </div>

        <div style={{ border: "1px solid var(--border-color)", borderRadius: "6px", maxHeight: "220px", overflow: "auto" }}>
          {results.length === 0 ? (
            <div style={{ padding: "10px", color: "var(--text-secondary)", fontSize: 12 }}>
              {t("clash_no_results") || "暂无碰撞结果"}
            </div>
          ) : (
            pageItems.map((item) => (
              <button
                key={item.id}
                className="ui-search-result-item"
                onClick={() => onFocusResult(item)}
                title={`${item.aUuid} <> ${item.bUuid}`}
              >
                <span>{item.aName || item.aUuid} {" <> "} {item.bName || item.bUuid}</span>
                <span style={{ opacity: 0.7, fontSize: 11 }}>
                  {(t("clash_overlap_volume") || "重叠体积")}: {item.overlapVolume.toFixed(6)}
                </span>
              </button>
            ))
          )}
        </div>

        {results.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Button
                variant="ghost"
                className="ui-properties-action ui-icon-btn"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                title={t("search_page_prev") || "上一页"}
              >
                <IconChevronLeft size={16} />
              </Button>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 64, textAlign: "center" }}>
                {currentPage}/{totalPages}
              </span>
              <Button
                variant="ghost"
                className="ui-properties-action ui-icon-btn"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                title={t("search_page_next") || "下一页"}
              >
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};
