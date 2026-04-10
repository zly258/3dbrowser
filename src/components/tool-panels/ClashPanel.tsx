import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, Checkbox, InputNumber, PaginationControls, Select } from "../common";

export interface ClashResultItem {
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
}

type ClashFilter = "ALL" | "NEW" | "CONFIRMED" | "RESOLVED";
type ClashTypeFilter = "ALL" | "HARD" | "CLEARANCE";

interface ClashPanelProps {
  t: (key: string) => string;
  onClose: () => void;
  running: boolean;
  progress: number;
  status: string;
  scannedCount: number;
  pairsScanned: number;
  results: ClashResultItem[];
  resultFilter: ClashFilter;
  modelOptions: Array<{ id: string; name: string }>;
  setA: string[];
  setB: string[];
  tolerance: number;
  minOverlapVolume: number;
  clearanceDistance: number;
  useNarrowPhase: boolean;
  useTrianglePhase: boolean;
  includeSameModel: boolean;
  onSetAChange: (next: string[]) => void;
  onSetBChange: (next: string[]) => void;
  onToleranceChange: (next: number) => void;
  onMinOverlapVolumeChange: (next: number) => void;
  onClearanceDistanceChange: (next: number) => void;
  onUseNarrowPhaseChange: (next: boolean) => void;
  onUseTrianglePhaseChange: (next: boolean) => void;
  onIncludeSameModelChange: (next: boolean) => void;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  onExportCsv: () => void;
  onIsolateByStatus: (status: "new" | "confirmed") => void;
  onRestoreVisibility: () => void;
  onResultFilterChange: (next: ClashFilter) => void;
  typeFilter: ClashTypeFilter;
  onTypeFilterChange: (next: ClashTypeFilter) => void;
  onUpdateResultStatus: (id: string, status: ClashResultItem["status"]) => void;
  onMarkFilteredStatus: (status: ClashResultItem["status"]) => void;
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
  resultFilter,
  modelOptions,
  setA,
  setB,
  tolerance,
  minOverlapVolume,
  clearanceDistance,
  useNarrowPhase,
  useTrianglePhase,
  includeSameModel,
  onSetAChange,
  onSetBChange,
  onToleranceChange,
  onMinOverlapVolumeChange,
  onClearanceDistanceChange,
  onUseNarrowPhaseChange,
  onUseTrianglePhaseChange,
  onIncludeSameModelChange,
  onRun,
  onCancel,
  onClear,
  onExportCsv,
  onIsolateByStatus,
  onRestoreVisibility,
  onResultFilterChange,
  typeFilter,
  onTypeFilterChange,
  onUpdateResultStatus,
  onMarkFilteredStatus,
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

  const counts = useMemo(() => {
    const c = { all: results.length, new: 0, confirmed: 0, resolved: 0 };
    results.forEach((item) => {
      if (item.status === "new") c.new += 1;
      else if (item.status === "confirmed") c.confirmed += 1;
      else if (item.status === "resolved") c.resolved += 1;
    });
    return c;
  }, [results]);

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const statusMatched =
        resultFilter === "ALL"
          || (resultFilter === "NEW" && item.status === "new")
          || (resultFilter === "CONFIRMED" && item.status === "confirmed")
          || (resultFilter === "RESOLVED" && item.status === "resolved");
      const typeMatched =
        typeFilter === "ALL"
          || (typeFilter === "HARD" && item.type === "hard")
          || (typeFilter === "CLEARANCE" && item.type === "clearance");
      return statusMatched && typeMatched;
    });
  }, [resultFilter, results, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => filteredResults.slice(pageStart, pageStart + pageSize), [filteredResults, pageStart, pageSize]);
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
      <div className="ui-toolpanel-body">
        <div className="ui-toolpanel-row-between">
          <div className="ui-toolpanel-caption">
            {t("clash_scope_visible") || "范围：当前可见构件"} | {t("clash_candidates") || "候选"}: {scannedCount}
          </div>
          <div className="ui-toolpanel-row">
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
            <Button className="ui-properties-action" onClick={onExportCsv} disabled={results.length === 0}>
              {t("clash_export_csv") || "导出 CSV"}
            </Button>
          </div>
        </div>
        <div className="ui-toolpanel-row ui-toolpanel-wrap">
          <Button className="ui-properties-action" onClick={() => onIsolateByStatus("new")} disabled={counts.new === 0}>
            {t("clash_isolate_new") || "仅看新建"}
          </Button>
          <Button className="ui-properties-action" onClick={() => onIsolateByStatus("confirmed")} disabled={counts.confirmed === 0}>
            {t("clash_isolate_confirmed") || "仅看已确认"}
          </Button>
          <Button className="ui-properties-action" onClick={onRestoreVisibility}>
            {t("show_all") || "显示全部"}
          </Button>
        </div>

        <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
          <div className="ui-selection-box">
            <div className="ui-selection-box-header">
              <div className="ui-toolpanel-caption-strong">{t("clash_set_a") || "模型集 A"}</div>
              <div className="ui-selection-box-actions">
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetASelectAll}>{t("select_all") || "全选"}</button>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetAClear}>{t("search_clear") || "清空"}</button>
              </div>
            </div>
            <div className="ui-selection-box-list">
              {modelOptions.length === 0 ? (
                <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models") || "暂无模型"}</div>
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
          <div className="ui-selection-box">
            <div className="ui-selection-box-header">
              <div className="ui-toolpanel-caption-strong">{t("clash_set_b") || "模型集 B"}</div>
              <div className="ui-selection-box-actions">
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBSelectAll}>{t("select_all") || "全选"}</button>
                <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBClear}>{t("search_clear") || "清空"}</button>
              </div>
            </div>
            <div className="ui-selection-box-list">
              {modelOptions.length === 0 ? (
                <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models") || "暂无模型"}</div>
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

        <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
          <div>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_tolerance") || "容差"}</div>
            <InputNumber
              className="ui-input-compact"
              value={Number.isFinite(tolerance) ? tolerance : 0}
              min={0}
              step={0.001}
              onChange={(value) => onToleranceChange(Math.max(0, value || 0))}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_min_overlap") || "最小重叠体积"}</div>
            <InputNumber
              className="ui-input-compact"
              value={Number.isFinite(minOverlapVolume) ? minOverlapVolume : 0}
              min={0}
              step={0.000001}
              onChange={(value) => onMinOverlapVolumeChange(Math.max(0, value || 0))}
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
          <div>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_clearance_distance") || "最小净空距离"}</div>
            <InputNumber
              className="ui-input-compact"
              value={Number.isFinite(clearanceDistance) ? clearanceDistance : 0}
              min={0}
              step={0.001}
              onChange={(value) => onClearanceDistanceChange(Math.max(0, value || 0))}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_detection_type") || "检测类型"}</div>
            <Select
              value={typeFilter}
              onChange={(value) => onTypeFilterChange(value as ClashTypeFilter)}
              options={[
                { value: "ALL", label: t("clash_type_all") || "全部" },
                { value: "HARD", label: t("clash_type_hard") || "硬碰撞" },
                { value: "CLEARANCE", label: t("clash_type_clearance") || "净空碰撞" }
              ]}
              className="ui-input-compact"
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <div className="ui-toolpanel-row-between">
          <Checkbox
            checked={useNarrowPhase}
            onChange={onUseNarrowPhaseChange}
            label={t("clash_narrow_phase") || "启用精筛（OBB）"}
            labelStyle={{ fontSize: 12 }}
          />
        </div>
        <div className="ui-toolpanel-row-between">
          <Checkbox
            checked={useTrianglePhase}
            onChange={onUseTrianglePhaseChange}
            label={t("clash_triangle_phase") || "启用三角面复核"}
            labelStyle={{ fontSize: 12 }}
          />
        </div>
        <div className="ui-toolpanel-row-between">
          <Checkbox
            checked={includeSameModel}
            onChange={onIncludeSameModelChange}
            label={t("clash_include_same_model") || "包含同模型内检测"}
            labelStyle={{ fontSize: 12 }}
          />
        </div>

        <div className="ui-toolpanel-caption">
          {status || (running ? (t("clash_running") || "正在执行碰撞检查...") : (t("clash_ready") || "准备就绪"))}
        </div>
        <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">
          {(t("clash_pairs_scanned") || "已扫描对数")}: {pairsScanned}
        </div>
        <div className="ui-progress-bar ui-progress-bar-full">
          <div className="ui-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>

        <div className="ui-toolpanel-row-between ui-toolpanel-caption">
          <span>{t("clash_results") || "碰撞结果"}: {filteredResults.length}</span>
          <div className="ui-toolpanel-row">
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

        <div className="ui-inline-actions ui-inline-actions-wrap">
          <button className={`ui-statusbar-tag ui-statusbar-tag-compact ${resultFilter === "ALL" ? "active" : ""}`} onClick={() => onResultFilterChange("ALL")}>
            {(t("clash_group_all") || "全部")} ({counts.all})
          </button>
          <button className={`ui-statusbar-tag ui-statusbar-tag-compact ${resultFilter === "NEW" ? "active" : ""}`} onClick={() => onResultFilterChange("NEW")}>
            {(t("clash_group_new") || "新建")} ({counts.new})
          </button>
          <button className={`ui-statusbar-tag ui-statusbar-tag-compact ${resultFilter === "CONFIRMED" ? "active" : ""}`} onClick={() => onResultFilterChange("CONFIRMED")}>
            {(t("clash_group_confirmed") || "已确认")} ({counts.confirmed})
          </button>
          <button className={`ui-statusbar-tag ui-statusbar-tag-compact ${resultFilter === "RESOLVED" ? "active" : ""}`} onClick={() => onResultFilterChange("RESOLVED")}>
            {(t("clash_group_resolved") || "已解决")} ({counts.resolved})
          </button>
        </div>
        <div className="ui-inline-actions ui-inline-actions-wrap">
          <Button className="ui-properties-action" onClick={() => onMarkFilteredStatus("confirmed")} disabled={filteredResults.length === 0}>
            {t("clash_mark_confirmed") || "当前组标记已确认"}
          </Button>
          <Button className="ui-properties-action" onClick={() => onMarkFilteredStatus("resolved")} disabled={filteredResults.length === 0}>
            {t("clash_mark_resolved") || "当前组标记已解决"}
          </Button>
          <Button className="ui-properties-action" onClick={() => onMarkFilteredStatus("new")} disabled={filteredResults.length === 0}>
            {t("clash_mark_new") || "当前组标记新建"}
          </Button>
        </div>

        <div className="ui-toolpanel-results-box">
          {filteredResults.length === 0 ? (
            <div className="ui-toolpanel-results-empty">
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
                <div className="ui-toolpanel-row-between">
                  <span className="ui-result-item-secondary">
                    {item.type === "hard"
                      ? `${t("clash_overlap_volume") || "重叠体积"}: ${item.overlapVolume.toFixed(6)}`
                      : `${t("clash_clearance_value") || "净空距离"}: ${item.distance.toFixed(6)}`}
                  </span>
                  <Select
                    value={item.status}
                    onChange={(value) => onUpdateResultStatus(item.id, value as ClashResultItem["status"])}
                    options={[
                      { value: "new", label: t("clash_group_new") || "新建" },
                      { value: "confirmed", label: t("clash_group_confirmed") || "已确认" },
                      { value: "resolved", label: t("clash_group_resolved") || "已解决" }
                    ]}
                    className="ui-input-compact"
                    style={{ minWidth: 88 }}
                  />
                </div>
                <div className="ui-toolpanel-row-between">
                  <span className="ui-result-item-secondary">
                    {(item.type === "hard" ? (t("clash_type_hard") || "硬碰撞") : (t("clash_type_clearance") || "净空碰撞"))}
                  </span>
                  <span className="ui-result-item-secondary">
                    {t(`clash_severity_${item.severity}`) || item.severity}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {filteredResults.length > 0 && (
          <PaginationControls
            prevTitle={t("search_page_prev") || "上一页"}
            nextTitle={t("search_page_next") || "下一页"}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        )}
      </div>
    </FloatingPanel>
  );
};
